import asyncio
import os
import random
from collections import OrderedDict
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from rooms import RoomManager
from security import RateLimiter, client_ip, valid_playlist_id

load_dotenv()

PORT = int(os.getenv("PORT", 5000))
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
# Sites allowed to call this API from the browser. Comma-separated, so the live
# site and local dev can both be listed, e.g.
# "https://doowops.vercel.app,http://localhost:5173".
FRONTEND_URLS = [u.strip().rstrip("/") for u in FRONTEND_URL.split(",") if u.strip()]

# { ytPlaylistId: {"tracks": [...], "expires_at": datetime} }, oldest first
yt_playlist_cache: OrderedDict = OrderedDict()
CACHE_TTL = timedelta(hours=24)
CACHE_MAX_PLAYLISTS = 50
MAX_PLAYLIST_ITEMS = 500  # YouTube quota and memory: stop paging here

limiters = {
    "create": RateLimiter(5, 60),
    "room": RateLimiter(20, 60),
    "playlist": RateLimiter(10, 60),
}


def rate_limit(name: str):
    def check(request: Request):
        wait = limiters[name].check(client_ip(request.headers, request.client))
        if wait:
            raise HTTPException(status_code=429, detail="Too many requests. Try again shortly.", headers={"Retry-After": str(wait)})
    return Depends(check)


def check_playlist_id(playlist_id: str) -> str:
    if not valid_playlist_id(playlist_id):
        raise HTTPException(status_code=400, detail="That doesn't look like a YouTube playlist ID.")
    return playlist_id


async def housekeeping():
    """Drop idle rooms and stale rate-limit entries even when nobody is creating rooms."""
    while True:
        await asyncio.sleep(60)
        room_manager.purge_idle()
        for limiter in limiters.values():
            limiter.prune()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(housekeeping())
    yield
    task.cancel()


app = FastAPI(title="DooWops API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_URLS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def fisher_yates_shuffle(lst: list) -> list:
    arr = lst[:]
    for i in range(len(arr) - 1, 0, -1):
        j = random.randint(0, i)
        arr[i], arr[j] = arr[j], arr[i]
    return arr


def normalize_yt_track(item: dict) -> Optional[dict]:
    snippet = item.get("snippet", {})
    vid_id = (
        item.get("contentDetails", {}).get("videoId")
        or (item.get("id", {}).get("videoId") if isinstance(item.get("id"), dict) else None)
    )
    if not vid_id:
        return None
    thumbnails = snippet.get("thumbnails", {})
    thumb_url = (
        thumbnails.get("high", {}).get("url")
        or thumbnails.get("medium", {}).get("url")
        or thumbnails.get("default", {}).get("url")
        or ""
    )
    return {
        "id": vid_id,
        "name": snippet.get("title", "Unknown"),
        # videoOwnerChannelTitle is the song's uploader; channelTitle on a
        # playlist item is just whoever owns the playlist.
        "artists": [{"name": (snippet.get("videoOwnerChannelTitle") or snippet.get("channelTitle", "")).removesuffix(" - Topic")}],
        "album": {"images": [{"url": thumb_url}]},
        "uri": vid_id,
        "preview_url": None,
        "youtube_video_id": vid_id,
        "source": "youtube",
    }


async def fetch_all_yt_items(playlist_id: str) -> list:
    if not YOUTUBE_API_KEY:
        raise HTTPException(status_code=503, detail="YOUTUBE_API_KEY not configured in .env")
    all_items = []
    page_token = None
    async with httpx.AsyncClient() as client:
        while True:
            params: dict = {
                "part": "contentDetails,snippet",
                "playlistId": playlist_id,
                "maxResults": 50,
                "key": YOUTUBE_API_KEY,
            }
            if page_token:
                params["pageToken"] = page_token
            resp = await client.get(
                "https://www.googleapis.com/youtube/v3/playlistItems",
                params=params,
            )
            if not resp.is_success:
                raise HTTPException(status_code=502, detail=f"YouTube API error: {resp.status_code}")
            data = resp.json()
            all_items.extend(data.get("items", []))
            page_token = data.get("nextPageToken")
            if not page_token or len(all_items) >= MAX_PLAYLIST_ITEMS:
                break
    return all_items[:MAX_PLAYLIST_ITEMS]


async def get_youtube_tracks(playlist_id: str) -> list:
    """All playable tracks in a YouTube playlist, normalized, via the 24h cache."""
    now = datetime.utcnow()
    cached = yt_playlist_cache.get(playlist_id)

    if cached and now < cached["expires_at"]:
        raw_items = cached["tracks"]
    else:
        raw_items = await fetch_all_yt_items(playlist_id)
        for key in [k for k, v in yt_playlist_cache.items() if now >= v["expires_at"]]:
            del yt_playlist_cache[key]
        yt_playlist_cache.pop(playlist_id, None)
        yt_playlist_cache[playlist_id] = {"tracks": raw_items, "expires_at": now + CACHE_TTL}
        while len(yt_playlist_cache) > CACHE_MAX_PLAYLISTS:
            yt_playlist_cache.popitem(last=False)

    return [t for item in raw_items if (t := normalize_yt_track(item)) is not None]


@app.get("/api/youtube-playlist/{playlist_id}", dependencies=[rate_limit("playlist")])
async def get_youtube_playlist(
    playlist_id: str,
    count: int = Query(3, ge=1, le=20),
    exclude: str = Query(""),
):
    check_playlist_id(playlist_id)
    exclude_ids = {e.strip() for e in exclude.split(",") if e.strip()} if exclude else set()
    normalized = await get_youtube_tracks(playlist_id)
    available = [t for t in normalized if t["id"] not in exclude_ids]
    return {"tracks": fisher_yates_shuffle(available)[:count]}


# ── Online rooms ─────────────────────────────────────────────────────────────
# See rooms.py. YouTube playlists only.

room_manager = RoomManager(load_tracks=get_youtube_tracks)


class CreateRoomBody(BaseModel):
    name: str = Field(min_length=1, max_length=24)
    playlist_id: str = Field(min_length=1, max_length=100)
    playlist_name: str = Field(default="custom playlist", max_length=60)
    num_rounds: int = Field(ge=2, le=10)


class JoinRoomBody(BaseModel):
    name: str = Field(min_length=1, max_length=24)


@app.post("/api/rooms", dependencies=[rate_limit("create")])
async def create_room(body: CreateRoomBody):
    check_playlist_id(body.playlist_id.strip())
    if room_manager.full():
        raise HTTPException(status_code=503, detail="The server is full right now. Try again later.")
    # Load the playlist up front so a bad link fails here, not mid-game.
    try:
        tracks = await get_youtube_tracks(body.playlist_id.strip())
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Couldn't load that YouTube playlist")
    if len(tracks) < body.num_rounds * 2 * 3 + 2:
        raise HTTPException(status_code=400, detail="That playlist is too short for this many rounds")
    room, host = room_manager.create(
        body.name.strip(), body.playlist_id.strip(), body.playlist_name.strip() or "custom playlist", body.num_rounds
    )
    return {"code": room.code, "token": host.token}


@app.get("/api/rooms/{code}", dependencies=[rate_limit("room")])
def get_room(code: str):
    room = room_manager.get(code)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    host = room.members.get(room.host_id)
    return {
        "code": room.code,
        "host": host.name if host else None,
        "status": room.status,
        "seats_open": sum(1 for s in room.seats.values() if s is None),
        "members": len(room.members),
    }


@app.post("/api/rooms/{code}/join", dependencies=[rate_limit("room")])
def join_room(code: str, body: JoinRoomBody):
    room = room_manager.get(code)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    member = room_manager.join(room, body.name.strip())
    if not member:
        raise HTTPException(status_code=409, detail="This room is full.")
    return {"code": room.code, "token": member.token}


@app.websocket("/ws/rooms/{code}")
async def room_socket(ws: WebSocket, code: str, token: Optional[str] = None):
    # Accept before closing so the browser receives our close code; closing
    # during the handshake only shows up as a generic failure (1006).
    await ws.accept()
    room = room_manager.get(code)
    if not room:
        await ws.close(code=4404)
        return
    me = room.member_for_token(token)
    if not me:
        await ws.close(code=4401)  # not (or no longer) a member: join again
        return
    await room_manager.connect(room, ws, me)
    try:
        while True:
            msg = await ws.receive_json()
            if isinstance(msg, dict):
                await room_manager.handle(room, me, msg, ws)
    except (WebSocketDisconnect, ValueError, RuntimeError):
        pass
    finally:
        await room_manager.disconnect(room, ws, me)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
