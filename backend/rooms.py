"""Online 1v1 rooms over WebSockets (ARCHITECTURE.md §2.4 / §2.5).

The server is authoritative: clients send intents ("pick", "next", ...) and get
back a full state snapshot after every change, so a refresh or a late joiner
never desyncs. Everything lives in memory in this process (no Supabase yet),
so rooms vanish on restart and do not fan out across multiple instances.

Lifecycle: lobby -> active -> voting -> (rematch) lobby.
Seat 1 is the host. Seat 2 is the first person to join. Anyone else watches.
Only the host hands out points and picks what plays in the voting phase;
everyone else follows along live.
"""

import asyncio
import random
import secrets
import time
from typing import Awaitable, Callable, Optional

from fastapi import WebSocket

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O/1/I/L
IDLE_ROOM_TTL = 2 * 60 * 60  # seconds a room with nobody connected is kept

TrackLoader = Callable[[str], Awaitable[list]]


class GuessTheSong:
    """Today's game as the first GameMode (ARCHITECTURE.md §2.6).

    Same rules as the same-device version in frontend/src/GamePage.jsx: each
    round player 1 then player 2 browse 3 songs (5 in the final round) and pick
    one. Going back is allowed after picking in normal rounds, and once per
    player in the final round.
    """

    min_players = 2
    max_players = 2

    def __init__(self, num_rounds: int):
        self.num_rounds = num_rounds
        self.round = 1
        self.active = 1
        self.choices: list = []
        self.index = 0
        self.picked: Optional[dict] = None
        self.picks: dict = {1: [], 2: []}
        self.go_back_used = {1: False, 2: False}
        self.used_ids: set = set()
        self.loading = False
        self.error: Optional[str] = None

    @property
    def is_final_round(self) -> bool:
        return self.round == self.num_rounds

    def choice_count(self) -> int:
        return 5 if self.is_final_round else 3

    def deal(self, tracks: list) -> None:
        available = [t for t in tracks if t["uri"] not in self.used_ids]
        self.choices = random.sample(available, min(self.choice_count(), len(available)))
        self.used_ids.update(t["uri"] for t in self.choices)
        self.index = 0
        self.picked = None
        self.go_back_used = {1: False, 2: False}
        self.error = None if self.choices else "No songs left in this playlist."

    def can_go_back(self) -> bool:
        if self.index == 0:
            return False
        if self.is_final_round:
            return not self.go_back_used[self.active]
        return self.picked is not None

    def on_action(self, action: str) -> str:
        """Apply a player move. Returns "deal" when a new turn needs songs,
        "end" when the match is over, else ""."""
        if self.loading:
            return ""
        if action == "next" and self.index < len(self.choices) - 1:
            self.index += 1
        elif action == "back" and self.can_go_back():
            self.index -= 1
            if self.is_final_round:
                self.go_back_used[self.active] = True
        elif action == "pick" and self.picked is None and self.choices:
            self.picked = self.choices[self.index]
            self.picks[self.active].append(self.picked)
        elif action == "advance" and self.picked is not None:
            if self.active == 1:
                self.active = 2
                return "deal"
            if self.is_final_round:
                return "end"
            self.round += 1
            self.active = 1
            return "deal"
        return ""

    def serialize_state(self) -> dict:
        return {
            "round": self.round,
            "num_rounds": self.num_rounds,
            "active": self.active,
            "choices": self.choices,
            "index": self.index,
            "picked": self.picked,
            "picks": {"1": self.picks[1], "2": self.picks[2]},
            "can_go_back": self.can_go_back(),
            "loading": self.loading,
            "error": self.error,
        }


class Room:
    def __init__(self, code: str, host_name: str, playlist_id: str, num_rounds: int):
        self.code = code
        self.playlist_id = playlist_id
        self.num_rounds = num_rounds
        self.status = "lobby"
        self.seats: dict = {1: {"name": host_name, "token": secrets.token_urlsafe(16)}, 2: None}
        self.connections: dict = {}  # WebSocket -> seat number (or None for spectators)
        self.game: Optional[GuessTheSong] = None
        self.votes: dict = {1: set(), 2: set()}
        self.now_playing: Optional[dict] = None  # scoreboard song the host is playing
        self.last_activity = time.time()
        self.lock = asyncio.Lock()

    def seat_for_token(self, token: Optional[str]) -> Optional[int]:
        for n, seat in self.seats.items():
            if seat and token and secrets.compare_digest(seat["token"], token):
                return n
        return None

    def connected_seats(self) -> set:
        return {s for s in self.connections.values() if s}

    def snapshot(self, seat: Optional[int]) -> dict:
        connected = self.connected_seats()
        return {
            "type": "state",
            "code": self.code,
            "status": self.status,
            "num_rounds": self.num_rounds,
            "players": {
                str(n): ({"name": s["name"], "connected": n in connected} if s else None)
                for n, s in self.seats.items()
            },
            "spectators": sum(1 for s in self.connections.values() if s is None),
            "game": self.game.serialize_state() if self.game else None,
            "votes": {"1": sorted(self.votes[1]), "2": sorted(self.votes[2])},
            "now_playing": self.now_playing,
            "you": {"seat": seat, "is_host": seat == 1},
        }

    async def broadcast(self) -> None:
        self.last_activity = time.time()
        dead = []
        for ws, seat in list(self.connections.items()):
            try:
                await ws.send_json(self.snapshot(seat))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.connections.pop(ws, None)


class RoomManager:
    def __init__(self, load_tracks: TrackLoader):
        self.rooms: dict = {}
        self.load_tracks = load_tracks

    def _new_code(self) -> str:
        while True:
            code = "".join(random.choice(CODE_ALPHABET) for _ in range(5))
            if code not in self.rooms:
                return code

    def _purge_idle(self) -> None:
        now = time.time()
        for code, room in list(self.rooms.items()):
            if not room.connections and now - room.last_activity > IDLE_ROOM_TTL:
                del self.rooms[code]

    def create(self, host_name: str, playlist_id: str, num_rounds: int) -> Room:
        self._purge_idle()
        room = Room(self._new_code(), host_name, playlist_id, num_rounds)
        self.rooms[room.code] = room
        return room

    def get(self, code: str) -> Optional[Room]:
        return self.rooms.get(code.upper())

    def join(self, room: Room, name: str) -> Optional[str]:
        """Claim seat 2. Returns its token, or None if it is taken."""
        if room.seats[2] is not None:
            return None
        room.seats[2] = {"name": name, "token": secrets.token_urlsafe(16)}
        room.last_activity = time.time()
        return room.seats[2]["token"]

    async def _deal(self, room: Room) -> None:
        game = room.game
        game.loading = True
        await room.broadcast()
        try:
            tracks = await self.load_tracks(room.playlist_id)
            game.deal(tracks)
        except Exception:
            game.choices = []
            game.error = "Couldn't load songs from the playlist."
        game.loading = False
        await room.broadcast()

    async def handle(self, room: Room, seat: Optional[int], msg: dict) -> None:
        kind = msg.get("type")
        async with room.lock:
            if kind == "start" and seat == 1 and room.status == "lobby" and room.seats[2]:
                room.status = "active"
                room.game = GuessTheSong(room.num_rounds)
                room.votes = {1: set(), 2: set()}
                room.now_playing = None
                await self._deal(room)
                return

            if kind in ("next", "back", "pick", "advance") and room.status == "active":
                if seat != room.game.active:
                    return
                outcome = room.game.on_action(kind)
                if outcome == "deal":
                    await self._deal(room)
                    return
                if outcome == "end":
                    room.status = "voting"
                await room.broadcast()
                return

            if kind == "retry" and room.status == "active" and seat in (1, room.game.active):
                await self._deal(room)
                return

            if kind == "vote" and seat == 1 and room.status == "voting":
                player, index = msg.get("player"), msg.get("index")
                if player in (1, 2) and isinstance(index, int) and 0 <= index < len(room.game.picks[player]):
                    room.votes[player] ^= {index}
                    await room.broadcast()
                return

            if kind == "play" and seat == 1 and room.status == "voting":
                player, index = msg.get("player"), msg.get("index")
                if player in (1, 2) and isinstance(index, int) and 0 <= index < len(room.game.picks[player]):
                    room.now_playing = {"player": player, "index": index}
                    await room.broadcast()
                return

            if kind == "rematch" and seat == 1 and room.status == "voting":
                room.status = "lobby"
                room.game = None
                room.votes = {1: set(), 2: set()}
                room.now_playing = None
                await room.broadcast()
                return

    async def connect(self, room: Room, ws: WebSocket, seat: Optional[int]) -> None:
        await ws.accept()
        room.connections[ws] = seat
        await room.broadcast()

    async def disconnect(self, room: Room, ws: WebSocket) -> None:
        room.connections.pop(ws, None)
        await room.broadcast()
