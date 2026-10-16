import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import main
from rooms import CODE_ALPHABET, CODE_LENGTH

ORIGIN = {"origin": "http://localhost:5173"}
PLAYLIST = "PLabcdefghijk"
TRACKS = [
    {"id": str(i), "uri": str(i), "name": f"song {i}", "artists": [{"name": "a"}], "album": {"images": []}, "youtube_video_id": str(i)}
    for i in range(80)
]


@pytest.fixture
def client(monkeypatch):
    async def fake_tracks(_playlist_id):
        return TRACKS

    monkeypatch.setattr(main, "get_youtube_tracks", fake_tracks)
    monkeypatch.setattr(main.room_manager, "load_tracks", fake_tracks)
    for limiter in main.limiters.values():
        limiter.hits.clear()
    return TestClient(main.app)


def make_room(client):
    res = client.post("/api/rooms", json={"name": "Host", "playlist_id": PLAYLIST, "num_rounds": 3})
    assert res.status_code == 200
    return res.json()


def test_invalid_playlist_id_rejected(client):
    assert client.get("/api/youtube-playlist/short").status_code == 400
    res = client.post("/api/rooms", json={"name": "Host", "playlist_id": "bad id!!bad id!!", "num_rounds": 3})
    assert res.status_code == 400


def test_rate_limiter_returns_429(client):
    codes = [client.get("/api/rooms/ZZZZZZ").status_code for _ in range(21)]
    assert codes[:20] == [404] * 20
    assert codes[20] == 429
    assert "retry-after" in client.get("/api/rooms/ZZZZZZ").headers


def test_room_code_length_and_alphabet(client):
    code = make_room(client)["code"]
    assert len(code) == CODE_LENGTH == 6
    assert set(code) <= set(CODE_ALPHABET)


def test_room_lookup_does_not_leak_host_name(client):
    code = make_room(client)["code"]
    body = client.get(f"/api/rooms/{code}").json()
    assert "host" not in body
    assert "Host" not in str(body)
    assert set(body) == {"code", "status", "seats_open", "members"}


def test_malformed_websocket_message_does_not_crash(client):
    room = make_room(client)
    with client.websocket_connect(f"/ws/rooms/{room['code']}", headers=ORIGIN) as ws:
        ws.send_json({"type": "auth", "token": room["token"]})
        assert ws.receive_json()["type"] == "state"
        for bad in ['{"type":"kick","member_id":["x"]}', '{"type":"sit","seat":99}', "not json", "[1]", '{"type":["x"]}']:
            ws.send_text(bad)
            assert ws.receive_json()["type"] == "error"
        ws.send_json({"type": "watch"})  # still alive and handling messages
        assert ws.receive_json()["type"] == "state"


def test_websocket_with_bad_origin_is_refused(client):
    room = make_room(client)
    for headers in ({"origin": "https://evil.example"}, {}):
        with pytest.raises(WebSocketDisconnect) as err:
            with client.websocket_connect(f"/ws/rooms/{room['code']}", headers=headers) as ws:
                ws.receive_json()
        assert err.value.code == 4403
