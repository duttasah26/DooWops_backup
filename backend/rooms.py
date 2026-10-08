"""Online 1v1 rooms over WebSockets (ARCHITECTURE.md §2.4 / §2.5).

The server is authoritative: clients send intents ("pick", "kick", ...) and get
back a full state snapshot after every change, so a refresh or a late joiner
never desyncs. Everything lives in memory in this process (no Supabase yet),
so rooms vanish on restart and do not fan out across multiple instances.

People: everyone in a room is a named member. Two members sit in seats 1 and 2
and play; everyone else watches. One member is the host, who runs the room
(settings, seats, kicks, start, finish, rematch).

Lifecycle: lobby -> active -> voting -> results -> (rematch) lobby.
Voting: watchers hand out +1s on picks. With no watchers, the host does.

Leaving: an explicit "leave" removes a member at once. A dropped connection
keeps the member for LEAVE_GRACE seconds so a refresh can rejoin the same
seat, then removes them. If a seated player is removed mid-game the game stops
and the room goes back to the lobby.
"""

import asyncio
import random
import secrets
import time
from typing import Awaitable, Callable, Optional

from fastapi import WebSocket

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O/1/I/L
IDLE_ROOM_TTL = 2 * 60 * 60  # seconds a room with nobody connected is kept
LEAVE_GRACE = 45  # seconds before a disconnected member is removed
MAX_MEMBERS = 30

TrackLoader = Callable[[str], Awaitable[list]]


class GuessTheSong:
    """Today's game as the first GameMode (ARCHITECTURE.md §2.6).

    Each round player 1 then player 2 browse 3 songs (5 in the final round) and
    pick one. Going back is allowed after picking in normal rounds, and once per
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


class Member:
    def __init__(self, name: str):
        self.id = secrets.token_hex(4)
        self.token = secrets.token_urlsafe(16)
        self.name = name
        self.sockets: set = set()
        self.leave_task: Optional[asyncio.Task] = None

    @property
    def connected(self) -> bool:
        return bool(self.sockets)


class Room:
    def __init__(self, code: str, playlist_id: str, playlist_name: str, num_rounds: int):
        self.code = code
        self.playlist_id = playlist_id
        self.playlist_name = playlist_name
        self.num_rounds = num_rounds
        self.status = "lobby"
        self.members: dict = {}  # id -> Member, in join order
        self.host_id: Optional[str] = None
        self.seats: dict = {1: None, 2: None}  # seat -> member id
        self.game: Optional[GuessTheSong] = None
        self.votes: dict = {}  # voter id -> {1: set(pick indexes), 2: set()}
        self.now_playing: Optional[dict] = None
        self.result: Optional[dict] = None
        self.notice: Optional[str] = None
        self.player_names: dict = {1: "", 2: ""}  # who played the current/last game
        self.last_activity = time.time()
        self.lock = asyncio.Lock()

    # ── membership ──────────────────────────────────────────────────────────

    def member_for_token(self, token: Optional[str]) -> Optional[Member]:
        if not token:
            return None
        for m in self.members.values():
            if secrets.compare_digest(m.token, token):
                return m
        return None

    def seat_of(self, member_id: str) -> Optional[int]:
        for n, mid in self.seats.items():
            if mid == member_id:
                return n
        return None

    def watcher_ids(self) -> list:
        seated = set(self.seats.values())
        return [mid for mid in self.members if mid not in seated]

    def voter_ids(self) -> list:
        watchers = self.watcher_ids()
        return watchers if watchers else ([self.host_id] if self.host_id else [])

    def add_member(self, name: str) -> Member:
        m = Member(name)
        self.members[m.id] = m
        if self.host_id is None:
            self.host_id = m.id
        if self.status == "lobby":
            for n in (1, 2):
                if self.seats[n] is None:
                    self.seats[n] = m.id
                    break
        return m

    def remove_member(self, member_id: str, reason: str) -> None:
        m = self.members.pop(member_id, None)
        if not m:
            return
        if m.leave_task:
            m.leave_task.cancel()
        seat = self.seat_of(member_id)
        if seat:
            self.seats[seat] = None
            if self.status == "active":
                self._stop_game(f"{m.name} {reason}, so the game stopped.")
        self.votes.pop(member_id, None)
        if self.host_id == member_id:
            # hand the room to a player first, then the longest-staying watcher
            nxt = next((mid for mid in self.seats.values() if mid), None) or next(iter(self.members), None)
            self.host_id = nxt

    def _stop_game(self, notice: str) -> None:
        self.status = "lobby"
        self.game = None
        self.votes = {}
        self.now_playing = None
        self.result = None
        self.notice = notice

    # ── scoring ─────────────────────────────────────────────────────────────

    def tally(self) -> dict:
        """+1 count for every pick: {1: [count per pick], 2: [...]}"""
        out = {}
        for p in (1, 2):
            picks = self.game.picks[p] if self.game else []
            out[p] = [sum(1 for v in self.votes.values() if i in v[p]) for i in range(len(picks))]
        return out

    def compute_result(self) -> dict:
        t = self.tally()
        scores = {p: sum(t[p]) for p in (1, 2)}
        winner = None if scores[1] == scores[2] else (1 if scores[1] > scores[2] else 2)
        return {"scores": {"1": scores[1], "2": scores[2]}, "winner": winner}

    # ── snapshot ────────────────────────────────────────────────────────────

    def snapshot(self, me: Optional[Member]) -> dict:
        def member_view(mid: str) -> dict:
            m = self.members[mid]
            return {"id": m.id, "name": m.name, "connected": m.connected, "is_host": mid == self.host_id}

        voters = self.voter_ids()
        my_votes = self.votes.get(me.id) if me else None
        tally = self.tally()
        return {
            "type": "state",
            "code": self.code,
            "status": self.status,
            "settings": {
                "playlist_id": self.playlist_id,
                "playlist_name": self.playlist_name,
                "num_rounds": self.num_rounds,
            },
            "host_id": self.host_id,
            "player_names": {"1": self.player_names[1], "2": self.player_names[2]},
            "seats": {str(n): (member_view(mid) if mid in self.members else None) for n, mid in self.seats.items()},
            "watchers": [member_view(mid) for mid in self.watcher_ids()],
            "game": self.game.serialize_state() if self.game else None,
            "tally": {"1": tally[1], "2": tally[2]},
            "voters": [member_view(mid) | {"votes": sum(len(s) for s in self.votes.get(mid, {1: (), 2: ()}).values())} for mid in voters],
            "voters_are": "watchers" if self.watcher_ids() else "host",
            "my_votes": {"1": sorted(my_votes[1]), "2": sorted(my_votes[2])} if my_votes else {"1": [], "2": []},
            "now_playing": self.now_playing,
            "result": self.result,
            "notice": self.notice,
            "you": {
                "id": me.id if me else None,
                "seat": self.seat_of(me.id) if me else None,
                "is_host": bool(me and me.id == self.host_id),
                "can_vote": bool(me and me.id in voters),
            },
        }

    async def broadcast(self) -> None:
        self.last_activity = time.time()
        for m in list(self.members.values()):
            for ws in list(m.sockets):
                try:
                    await ws.send_json(self.snapshot(m))
                except Exception:
                    m.sockets.discard(ws)


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
            empty = not room.members or not any(m.connected for m in room.members.values())
            if empty and now - room.last_activity > IDLE_ROOM_TTL:
                del self.rooms[code]

    def create(self, host_name: str, playlist_id: str, playlist_name: str, num_rounds: int):
        self._purge_idle()
        room = Room(self._new_code(), playlist_id, playlist_name, num_rounds)
        host = room.add_member(host_name)
        self.rooms[room.code] = room
        return room, host

    def get(self, code: str) -> Optional[Room]:
        return self.rooms.get(code.upper())

    def join(self, room: Room, name: str) -> Optional[Member]:
        if len(room.members) >= MAX_MEMBERS:
            return None
        m = room.add_member(name)
        room.last_activity = time.time()
        return m

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

    async def _remove(self, room: Room, member_id: str, reason: str) -> None:
        m = room.members.get(member_id)
        if not m:
            return
        sockets = list(m.sockets)
        room.remove_member(member_id, reason)
        for ws in sockets:
            try:
                await ws.send_json({"type": "removed", "reason": reason})
                await ws.close(code=4403)
            except Exception:
                pass
        if not room.members:
            self.rooms.pop(room.code, None)
            return
        await room.broadcast()

    async def handle(self, room: Room, me: Member, msg: dict, ws: WebSocket) -> None:
        kind = msg.get("type")
        async with room.lock:
            if me.id not in room.members:
                return
            is_host = me.id == room.host_id
            my_seat = room.seat_of(me.id)
            target = room.members.get(msg.get("member_id") or "")

            # ── anyone ──
            if kind == "leave":
                await self._remove(room, me.id, "left")
                return

            if kind == "sit" and room.status == "lobby" and msg.get("seat") in (1, 2):
                seat = msg["seat"]
                if room.seats[seat] is None:
                    if my_seat:
                        room.seats[my_seat] = None
                    room.seats[seat] = me.id
                    room.notice = None
                    await room.broadcast()
                return

            if kind == "watch" and room.status == "lobby" and my_seat:
                room.seats[my_seat] = None
                await room.broadcast()
                return

            # ── host: room management (lobby) ──
            if is_host and room.status == "lobby":
                if kind == "settings":
                    rounds = msg.get("num_rounds")
                    if isinstance(rounds, int) and 2 <= rounds <= 10:
                        room.num_rounds = rounds
                    pid = msg.get("playlist_id")
                    if isinstance(pid, str) and pid.strip() and pid != room.playlist_id:
                        try:
                            tracks = await self.load_tracks(pid.strip())
                        except Exception:
                            tracks = []
                        if len(tracks) < 2 * 3 * room.num_rounds + 2:
                            await ws.send_json({"type": "error", "message": "Couldn't use that playlist. Check the link, or it may be too short for this many rounds."})
                        else:
                            room.playlist_id = pid.strip()
                            room.playlist_name = str(msg.get("playlist_name") or "custom playlist")[:60]
                    await room.broadcast()
                    return

                if kind == "move" and target and msg.get("to") in (1, 2, "watch"):
                    to = msg["to"]
                    cur = room.seat_of(target.id)
                    if to == "watch":
                        if cur:
                            room.seats[cur] = None
                    elif room.seats[to] in (None, target.id):
                        if cur:
                            room.seats[cur] = None
                        room.seats[to] = target.id
                    else:
                        # swap with whoever is in that seat
                        other = room.seats[to]
                        room.seats[to] = target.id
                        if cur:
                            room.seats[cur] = other
                    await room.broadcast()
                    return

                if kind == "start" and room.seats[1] and room.seats[2]:
                    room.status = "active"
                    room.player_names = {n: room.members[room.seats[n]].name for n in (1, 2)}
                    room.game = GuessTheSong(room.num_rounds)
                    room.votes = {}
                    room.now_playing = None
                    room.result = None
                    room.notice = None
                    await self._deal(room)
                    return

            # ── host: any time ──
            if is_host and kind == "make_host" and target:
                room.host_id = target.id
                await room.broadcast()
                return

            if is_host and kind == "kick" and target and target.id != me.id:
                await self._remove(room, target.id, "was removed by the host")
                return

            # ── players: the game ──
            if kind in ("next", "back", "pick", "advance") and room.status == "active":
                if my_seat != room.game.active:
                    return
                outcome = room.game.on_action(kind)
                if outcome == "deal":
                    await self._deal(room)
                    return
                if outcome == "end":
                    room.status = "voting"
                    room.votes = {}
                await room.broadcast()
                return

            if kind == "retry" and room.status == "active" and (is_host or my_seat == room.game.active):
                await self._deal(room)
                return

            # ── voting ──
            if kind == "vote" and room.status == "voting" and me.id in room.voter_ids():
                player, index = msg.get("player"), msg.get("index")
                if player in (1, 2) and isinstance(index, int) and 0 <= index < len(room.game.picks[player]):
                    mine = room.votes.setdefault(me.id, {1: set(), 2: set()})
                    mine[player] ^= {index}
                    await room.broadcast()
                return

            if kind == "play" and is_host and room.status in ("voting", "results"):
                player, index = msg.get("player"), msg.get("index")
                if player in (1, 2) and isinstance(index, int) and 0 <= index < len(room.game.picks[player]):
                    room.now_playing = {"player": player, "index": index}
                    await room.broadcast()
                return

            if kind == "finish" and is_host and room.status == "voting":
                room.status = "results"
                room.result = room.compute_result()
                await room.broadcast()
                return

            if kind == "rematch" and is_host and room.status in ("voting", "results"):
                room.status = "lobby"
                room.game = None
                room.votes = {}
                room.now_playing = None
                room.result = None
                room.notice = None
                await room.broadcast()
                return

    async def connect(self, room: Room, ws: WebSocket, me: Member) -> None:
        if me.leave_task:
            me.leave_task.cancel()
            me.leave_task = None
        me.sockets.add(ws)
        await room.broadcast()

    async def disconnect(self, room: Room, ws: WebSocket, me: Member) -> None:
        me.sockets.discard(ws)
        if me.id not in room.members:
            return
        if not me.connected:
            me.leave_task = asyncio.create_task(self._remove_after_grace(room, me))
        await room.broadcast()

    async def _remove_after_grace(self, room: Room, me: Member) -> None:
        try:
            await asyncio.sleep(LEAVE_GRACE)
        except asyncio.CancelledError:
            return
        async with room.lock:
            if me.id in room.members and not me.connected:
                me.leave_task = None
                await self._remove(room, me.id, "lost connection")
