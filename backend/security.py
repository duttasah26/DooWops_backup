"""Small abuse guards: playlist-ID check, per-IP rate limiter, client IP,
name cleanup and WebSocket message validation."""

import json
import re
import time
import unicodedata
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


# ── names ────────────────────────────────────────────────────────────────────

def clean_name(raw: str) -> str:
    """Strip control, format (zero-width, bidi) and line-break characters,
    collapse whitespace. Returns "" when nothing is left."""
    kept = "".join(ch for ch in raw if unicodedata.category(ch) not in ("Cc", "Cf", "Cs", "Co", "Cn", "Zl", "Zp"))
    return " ".join(kept.split())


# ── WebSocket messages ───────────────────────────────────────────────────────

MAX_MESSAGE_CHARS = 4096


def _int(lo: int, hi: int):
    return lambda v: isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi


def _str(max_len: int, ascii_only: bool = False):
    return lambda v: isinstance(v, str) and 1 <= len(v) <= max_len and (not ascii_only or v.isascii())


_member_id = _str(16)
_seat = _int(1, 2)
_pick_ref = {"player": (_seat, True), "index": (_int(0, 99), True)}

# message type -> {field: (check, required)}; fields not listed are dropped
MESSAGE_SPECS = {
    "auth": {"token": (_str(64, ascii_only=True), True)},
    "leave": {}, "watch": {}, "start": {}, "finish": {}, "rematch": {},
    "next": {}, "back": {}, "pick": {}, "advance": {}, "retry": {},
    "sit": {"seat": (_seat, True)},
    "lock": {"locked": (lambda v: isinstance(v, bool), True)},
    "settings": {
        "num_rounds": (_int(2, 10), False),
        "playlist_id": (_str(100), False),
        "playlist_name": (_str(60), False),
    },
    "move": {"member_id": (_member_id, True), "to": (lambda v: v in (1, 2, "watch") and not isinstance(v, bool), True)},
    "make_host": {"member_id": (_member_id, True)},
    "kick": {"member_id": (_member_id, True)},
    "vote": _pick_ref,
    "play": _pick_ref,
}


def parse_message(text: str) -> dict:
    """Decode and validate one client message. Raises ValueError (with a
    short reason that is safe to show the client) when it isn't acceptable."""
    if not isinstance(text, str) or len(text) > MAX_MESSAGE_CHARS:
        raise ValueError("Message too large.")
    try:
        msg = json.loads(text)
    except ValueError:
        raise ValueError("Messages must be JSON.") from None
    if not isinstance(msg, dict):
        raise ValueError("Messages must be JSON objects.")
    kind = msg.get("type")
    spec = MESSAGE_SPECS.get(kind) if isinstance(kind, str) else None
    if spec is None:
        raise ValueError("Unknown message type.")
    clean = {"type": kind}
    for field, (check, required) in spec.items():
        if field not in msg:
            if required:
                raise ValueError(f"Missing {field}.")
            continue
        if not check(msg[field]):
            raise ValueError(f"Bad {field}.")
        clean[field] = msg[field]
    return clean
