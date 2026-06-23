import os
import random
import base64
import secrets
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI", "http://localhost:5000/auth/callback")
PORT = int(os.getenv("PORT", 5000))
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

if not CLIENT_ID or not CLIENT_SECRET:
    raise RuntimeError("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env")

# In-memory state (single-user, local dev)
latest_token: Optional[str] = None
latest_refresh_token: Optional[str] = None
playlist_cache: dict = {}     # { playlistId: {"tracks": [...], "expires_at": datetime} }
yt_playlist_cache: dict = {}  # { ytPlaylistId: {"tracks": [...], "expires_at": datetime} }
CACHE_TTL = timedelta(hours=24)

app = FastAPI(title="DooWops API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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


def get_basic_auth() -> str:
    return "Basic " + base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()


def normalize_spotify_track(item: dict) -> Optional[dict]:
    t = item.get("track") or item
    if not t or not t.get("id"):
        return None
    return {
        "id": f"spotify:track:{t['id']}",
        "name": t["name"],
        "artists": [{"name": a["name"]} for a in t.get("artists", [])],
        "album": {"images": t.get("album", {}).get("images", [])},
        "uri": t["uri"],
        "preview_url": t.get("preview_url"),
        "source": "spotify",
    }


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
        "artists": [{"name": snippet.get("channelTitle", "")}],
        "album": {"images": [{"url": thumb_url}]},
        "uri": vid_id,
        "preview_url": None,
        "youtube_video_id": vid_id,
        "source": "youtube",
    }


async def refresh_access_token():
    global latest_token, latest_refresh_token
    if not latest_refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token — please log in again")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://accounts.spotify.com/api/token",
            data={"grant_type": "refresh_token", "refresh_token": latest_refresh_token},
            headers={"Authorization": get_basic_auth(), "Content-Type": "application/x-www-form-urlencoded"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Failed to refresh token")
    body = resp.json()
    latest_token = body["access_token"]
    if body.get("refresh_token"):
        latest_refresh_token = body["refresh_token"]


async def fetch_all_spotify_tracks(playlist_id: str) -> list:
    all_items = []
    offset = 0
    async with httpx.AsyncClient() as client:
        while True:
            resp = await client.get(
                f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks",
                params={
                    "limit": 100,
                    "offset": offset,
                    "fields": "items(track(id,name,artists,album(images),uri,preview_url)),next",
                },
                headers={"Authorization": f"Bearer {latest_token}"},
            )
            if resp.status_code == 401:
                raise httpx.HTTPStatusError("401", request=resp.request, response=resp)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("items", [])
            if not items:
                break
            all_items.extend(items)
            if not data.get("next"):
                break
            offset += 100
    return all_items


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
            if not page_token:
                break
    return all_items


# ── Auth routes ──────────────────────────────────────────────────────────────

@app.get("/auth/login")
def login():
    scope = " ".join([
        "streaming", "user-read-email", "user-read-private",
        "user-modify-playback-state", "user-read-playback-state",
        "user-read-currently-playing", "app-remote-control",
        "playlist-read-private",
    ])
    params = urlencode({
        "response_type": "code",
        "client_id": CLIENT_ID,
        "scope": scope,
        "redirect_uri": REDIRECT_URI,
        "state": secrets.token_urlsafe(8),
        "show_dialog": "true",
    })
    return RedirectResponse(f"https://accounts.spotify.com/authorize?{params}")


@app.get("/auth/callback")
async def callback(
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
):
    global latest_token, latest_refresh_token
    if error:
        return RedirectResponse(f"{FRONTEND_URL}/#error={error}")
    if not code:
        return RedirectResponse(f"{FRONTEND_URL}/#error=missing_code")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://accounts.spotify.com/api/token",
            data={
                "code": code,
                "redirect_uri": REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            headers={
                "Authorization": get_basic_auth(),
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )

    if resp.status_code != 200:
        return RedirectResponse(f"{FRONTEND_URL}/#error=token_exchange_failed")

    body = resp.json()
    latest_token = body.get("access_token")
    latest_refresh_token = body.get("refresh_token")

    if not latest_refresh_token:
        # Force re-consent to get a refresh token
        return RedirectResponse("/auth/login")

    return RedirectResponse(f"{FRONTEND_URL}/#access_token={latest_token}")


# ── Playlist routes ───────────────────────────────────────────────────────────

@app.get("/api/playlist/{playlist_id}")
async def get_spotify_playlist(
    playlist_id: str,
    count: int = Query(3, ge=1, le=20),
    exclude: str = Query(""),
):
    exclude_ids = {e.strip() for e in exclude.split(",") if e.strip()} if exclude else set()
    now = datetime.utcnow()
    cached = playlist_cache.get(playlist_id)

    if cached and now < cached["expires_at"]:
        raw_items = cached["tracks"]
    else:
        try:
            raw_items = await fetch_all_spotify_tracks(playlist_id)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                await refresh_access_token()
                raw_items = await fetch_all_spotify_tracks(playlist_id)
            else:
                raise HTTPException(status_code=502, detail="Failed to fetch Spotify playlist")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch playlist: {e}")
        playlist_cache[playlist_id] = {"tracks": raw_items, "expires_at": now + CACHE_TTL}

    normalized = [t for item in raw_items if (t := normalize_spotify_track(item)) is not None]
    available = [t for t in normalized if t["id"] not in exclude_ids and t["uri"] not in exclude_ids]
    return {"tracks": fisher_yates_shuffle(available)[:count]}


@app.get("/api/youtube-playlist/{playlist_id}")
async def get_youtube_playlist(
    playlist_id: str,
    count: int = Query(3, ge=1, le=20),
    exclude: str = Query(""),
):
    exclude_ids = {e.strip() for e in exclude.split(",") if e.strip()} if exclude else set()
    now = datetime.utcnow()
    cached = yt_playlist_cache.get(playlist_id)

    if cached and now < cached["expires_at"]:
        raw_items = cached["tracks"]
    else:
        raw_items = await fetch_all_yt_items(playlist_id)
        yt_playlist_cache[playlist_id] = {"tracks": raw_items, "expires_at": now + CACHE_TTL}

    normalized = [t for item in raw_items if (t := normalize_yt_track(item)) is not None]
    available = [t for t in normalized if t["id"] not in exclude_ids]
    return {"tracks": fisher_yates_shuffle(available)[:count]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
