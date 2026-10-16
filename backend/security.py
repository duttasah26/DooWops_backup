"""Small abuse guards: playlist-ID check, per-IP rate limiter, client IP."""

import re
import time
from collections import deque

PLAYLIST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{10,64}$")


def valid_playlist_id(value) -> bool:
    return isinstance(value, str) and bool(PLAYLIST_ID_RE.fullmatch(value))


def client_ip(headers, peer) -> str:
    """The caller's IP. Render sits behind its own proxy, which appends the
    address it saw to X-Forwarded-For. Everything before that last entry was
    written by the client and can be faked, so only the last hop is trusted.
    This assumes exactly one trusted proxy in front of the app; with none (local
    dev) the header is absent and the socket peer is used."""
    forwarded = headers.get("x-forwarded-for", "")
    last = forwarded.split(",")[-1].strip() if forwarded else ""
    return last or (peer.host if peer else "unknown")


class RateLimiter:
    """Sliding window: at most `limit` hits per `window` seconds per key."""

    def __init__(self, limit: int, window: float):
        self.limit = limit
        self.window = window
        self.hits: dict = {}  # key -> deque of timestamps

    def check(self, key: str) -> int:
        """0 if allowed (and counted), else seconds until a retry could work."""
        now = time.monotonic()
        q = self.hits.setdefault(key, deque())
        while q and now - q[0] >= self.window:
            q.popleft()
        if len(q) >= self.limit:
            return max(1, int(self.window - (now - q[0])) + 1)
        q.append(now)
        return 0

    def prune(self) -> None:
        now = time.monotonic()
        for key, q in list(self.hits.items()):
            if not q or now - q[-1] >= self.window:
                del self.hits[key]
