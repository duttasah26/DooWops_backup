# DooWops: Implementation Handoff

## Context

DooWops is a 1v1 music game: players take turns picking songs from a playlist across N rounds, then vote on a scoreboard. The app currently uses Node.js/Express + Spotify but is broken (Spotify API issues, no Premium = no audio, songs repeat across rounds).

**Immediate goals:**
1. Replace Node.js backend with Python (FastAPI)
2. Fix Spotify OAuth and playlist fetching
3. Fix song deduplication across rounds
4. Fix Scoreboard playback for non-Premium users (preview_url fallback)
5. Add YouTube Mode (paste YouTube playlist URL → play via YouTube embed)

**Future goals (not in this plan):**
- AWS deployment
- WebSocket real-time multi-player

---

## Architecture After This Plan

```
frontend (React/Vite :5173)
    ↓ REST calls
backend (FastAPI :5000)  ← replaces server.js
    ↓ httpx
  Spotify API            ← Spotify mode
  YouTube Data API v3    ← YouTube mode
```

---

## Phase 1: Python FastAPI Backend

### Create `backend/requirements.txt`
```
fastapi==0.115.0
uvicorn[standard]==0.30.6
httpx==0.27.2
python-dotenv==1.0.1
```

### Create `backend/main.py`

**In-memory state (same semantics as server.js globals):**
```python
latest_token: str | None = None
latest_refresh_token: str | None = None
playlist_cache: dict = {}    # { playlistId: {tracks, expires_at} }
yt_playlist_cache: dict = {} # { ytPlaylistId: {tracks, expires_at} }
CACHE_TTL = timedelta(hours=24)
```

**Routes to implement:**

| Route | Description |
|-------|-------------|
| `GET /auth/login` | Redirect to Spotify OAuth consent |
| `GET /auth/callback` | Exchange code → set latest_token → redirect to `http://localhost:5173/#access_token={token}` |
| `GET /api/playlist/{playlistId}?count=N&exclude=uri1,uri2` | Spotify mode: return N random tracks (Fisher-Yates), excluding given URIs |
| `GET /api/youtube-playlist/{ytPlaylistId}?count=N&exclude=videoId1` | YouTube mode: return N random tracks from YouTube playlist |

**Key implementation details:**

1. **Fisher-Yates shuffle** (replaces the biased `sort(() => 0.5 - Math.random())` in server.js):
```python
def fisher_yates_shuffle(lst):
    arr = lst[:]
    for i in range(len(arr)-1, 0, -1):
        j = random.randint(0, i)
        arr[i], arr[j] = arr[j], arr[i]
    return arr
```

2. **Spotify track normalization** — normalize server-side so `GamePage.jsx:15`'s `.track ? t.track : t` still works (flat tracks have no `.track` key):
```python
def normalize_spotify_track(item):
    t = item.get("track") or item
    if not t or not t.get("id"):
        return None
    return {
        "id": f"spotify:track:{t['id']}",
        "name": t["name"],
        "artists": [{"name": a["name"]} for a in t.get("artists", [])],
        "album": {"images": t.get("album", {}).get("images", [])},
        "uri": t["uri"],
        "preview_url": t.get("preview_url"),  # may be None
        "source": "spotify",
    }
```

3. **YouTube track normalization:**
```python
def normalize_yt_track(item):
    snippet = item.get("snippet", {})
    vid_id = item.get("contentDetails", {}).get("videoId") or item.get("id", {}).get("videoId")
    if not vid_id:
        return None
    return {
        "id": vid_id,
        "name": snippet.get("title", "Unknown"),
        "artists": [{"name": snippet.get("channelTitle", "")}],
        "album": {"images": [{"url": snippet.get("thumbnails", {}).get("high", {}).get("url", "")}]},
        "uri": vid_id,
        "preview_url": None,
        "youtube_video_id": vid_id,
        "source": "youtube",
    }
```

4. **YouTube playlist fetch** (YouTube Data API v3):
- `GET https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails,snippet&playlistId={id}&maxResults=50&key={YOUTUBE_API_KEY}`
- Paginate with `nextPageToken`

5. **Token refresh on 401** — catch Spotify 401, call refresh, retry once (same logic as server.js).

6. **Do NOT port** the `/tokens` endpoint from server.js — it exposes secrets.

7. **CORS:** `allow_origins=["http://localhost:5173"]`

**Add to `backend/.env`:**
```
YOUTUBE_API_KEY=<get from Google Cloud Console — YouTube Data API v3>
```

**Start command:** `python main.py` or `uvicorn main:app --reload --port 5000`

---

## Phase 2: Frontend — Song Deduplication

**File:** `frontend/src/GamePage.jsx`

Current `fetchTracks()` never excludes songs from prior rounds — repeats are guaranteed.

**Fix:** Use a `useRef` to accumulate used track URIs across rounds without triggering re-renders.

```javascript
// Add near other refs in GamePage:
const usedTrackIdsRef = useRef(new Set());

// Update fetchTracks to accept an exclude param (line ~7):
async function fetchTracks(playlistId, count, setTokenError, exclude = "") {
    const params = new URLSearchParams({ count });
    if (exclude) params.set("exclude", exclude);
    const res = await fetch(`${BACKEND_URL}/api/playlist/${playlistId}?${params}`);
    // ... rest unchanged
}

// In the useEffect that fetches choices, pass and update the exclusion list:
const excludeParam = [...usedTrackIdsRef.current].join(",");
fetchTracks(playlistId, count, setTokenError, excludeParam).then(newChoices => {
    setChoices(newChoices);
    setChoicesLoading(false);
    newChoices.forEach(t => usedTrackIdsRef.current.add(t.uri));
});
```

The existing `useEffect` dependency array stays unchanged — ref mutations don't cause re-renders.

---

## Phase 3: Frontend — Audio Fallback (Non-Premium Spotify)

**File:** `frontend/src/WebPlayback.jsx`

Add `previewUrl` prop. When Spotify SDK is not active, render `<audio>` with preview_url instead of "Connect to Spotify".

```javascript
const WebPlayback = ({ token, trackUri, onReady, previewUrl }) => {
    const audioRef = useRef(null);

    // Stop preview when SDK takes over
    useEffect(() => {
        if (isActive && audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
    }, [isActive]);

    // Play preview when SDK not ready
    useEffect(() => {
        if (!isActive && previewUrl && audioRef.current) {
            audioRef.current.src = previewUrl;
            audioRef.current.play().catch(() => {});
        }
    }, [previewUrl, isActive]);

    if (!isActive) {
        return previewUrl ? (
            <audio ref={audioRef} controls className="w-full" />
        ) : (
            <p>Connect to Spotify — Open app and select "Doowops Player"</p>
        );
    }
    // ... rest of SDK UI unchanged
};
```

**Callers to update:**
- `GamePage.jsx` line ~275: add `previewUrl={displayTrack?.preview_url}`
- `Scoreboard.jsx` line ~392: add `previewUrl={activeTrack?.preview_url}`

**File:** `frontend/src/Scoreboard.jsx`

On track cards where `preview_url === null`, show a label so users know no audio is available:
```jsx
{!track.preview_url && <span className="text-xs text-zinc-500">No preview</span>}
```

---

## Phase 4: YouTube Mode

### `frontend/src/Lobby.jsx`

Add a **Spotify / YouTube** mode toggle at the top of the screen.

- **Spotify mode** (default): existing UI unchanged
- **YouTube mode**: single input — "Paste YouTube Playlist URL or ID"
  - Parse playlist ID from URL: `https://www.youtube.com/playlist?list=PLxxx` → `PLxxx`
  - No Spotify login required

Pass `mode: "spotify" | "youtube"` in the settings object to `onStart`.

### `frontend/src/App.jsx`

- If `mode === "youtube"`, skip Spotify token check — go directly to Lobby without requiring OAuth.
- Pass `mode` down to `GamePage`.

### `frontend/src/GamePage.jsx`

- If `mode === "youtube"`, call `GET /api/youtube-playlist/{playlistId}?count=N&exclude=...`
- Track objects have `source: "youtube"` and `youtube_video_id` field

### New file: `frontend/src/YouTubePlayer.jsx`

```jsx
export function YouTubePlayer({ videoId }) {
    if (!videoId) return null;
    return (
        <iframe
            width="100%"
            height="80"
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=1`}
            allow="autoplay; encrypted-media"
            allowFullScreen
            className="rounded-lg"
        />
    );
}
```

### `frontend/src/WebPlayback.jsx`

Add branch: if `track.source === "youtube"`, render `<YouTubePlayer videoId={track.youtube_video_id} />` instead of Spotify SDK player.

---

## Phase 5: Cleanup (after Python backend is verified)

- `backend/server.js` — delete
- `backend/package.json` — delete
- `frontend/src/ReLogin.jsx` — dead code (never imported), delete

---

## File Change Summary

| File | Action |
|------|--------|
| `backend/main.py` | CREATE — FastAPI backend |
| `backend/requirements.txt` | CREATE |
| `backend/.env` | ADD `YOUTUBE_API_KEY` |
| `backend/server.js` | KEEP temporarily, DELETE after Python verified |
| `frontend/src/GamePage.jsx` | MODIFY — exclusion ref + YouTube mode branch + previewUrl prop |
| `frontend/src/WebPlayback.jsx` | MODIFY — previewUrl prop + audio fallback + YouTube branch |
| `frontend/src/Scoreboard.jsx` | MODIFY — pass previewUrl to WebPlayback, null-preview label |
| `frontend/src/Lobby.jsx` | MODIFY — mode toggle (Spotify / YouTube), YouTube playlist input |
| `frontend/src/App.jsx` | MODIFY — skip Spotify auth in YouTube mode |
| `frontend/src/YouTubePlayer.jsx` | CREATE — YouTube iframe embed component |

---

## Local Testing Checklist

1. `cd backend && pip install -r requirements.txt && python main.py`
2. `cd frontend && npm run dev`
3. **Spotify mode:** Login → pick playlist → 1v1 game → scoreboard (songs playable via preview_url or SDK)
4. Check Network tab: `exclude` param should grow each round (deduplication working)
5. **Scoreboard:** click each card → audio plays via `<audio>` (non-premium) or SDK (premium)
6. **YouTube mode:** skip login → paste YouTube playlist URL in Lobby → game works → songs play via iframe embed
7. Play a full game — verify no song repeats across rounds
