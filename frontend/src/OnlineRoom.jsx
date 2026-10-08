import { useCallback, useEffect, useRef, useState } from "react";
import RetroShell from "./components/RetroShell";
import TurnView from "./TurnView";
import { trackTitle } from "./trackTitle";
import YouTubePlayer from "./YouTubePlayer";
import Scoreboard from "./Scoreboard";
import usePageTitle from "./usePageTitle";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
const WS_URL = BACKEND_URL.replace(/^http/, "ws");

// Seat tokens live in sessionStorage so a refresh rejoins the same seat, while
// two tabs on one machine can still be two different players.
const seatKey = code => `doowops_room_${code}`;
function loadSeat(code) {
  try {
    return JSON.parse(sessionStorage.getItem(seatKey(code))) || null;
  } catch {
    return null;
  }
}
function saveSeat(code, seat) {
  try {
    sessionStorage.setItem(seatKey(code), JSON.stringify(seat));
  } catch {
    // private mode etc: the game still works, a refresh just won't rejoin
  }
}

function setRoomInUrl(code) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set("room", code);
  else url.searchParams.delete("room");
  window.history.replaceState(null, "", url);
}

function extractYouTubePlaylistId(str) {
  const v = (str || "").trim();
  try {
    const list = new URL(v).searchParams.get("list");
    if (list) return list;
  } catch {
    // not a URL, treat it as a bare ID
  }
  return v;
}

async function postJson(path, body) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof data.detail === "string" ? data.detail : "Something went wrong. Check the form and try again.";
    throw new Error(detail);
  }
  return data;
}

function useRoomSocket(code, token) {
  const [state, setState] = useState(null);
  const [connection, setConnection] = useState("connecting");
  const wsRef = useRef(null);

  useEffect(() => {
    let stopped = false;
    let retry = 0;
    let timer;

    function open() {
      const qs = token ? `?token=${encodeURIComponent(token)}` : "";
      const ws = new WebSocket(`${WS_URL}/ws/rooms/${code}${qs}`);
      wsRef.current = ws;
      setConnection(c => (c === "open" ? "reconnecting" : c));
      ws.onopen = () => {
        retry = 0;
        setConnection("open");
      };
      ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "state") setState(msg);
        } catch {
          // ignore anything that isn't a state snapshot
        }
      };
      ws.onclose = e => {
        if (stopped) return;
        if (e.code === 4404) {
          setConnection("notfound");
          return;
        }
        setConnection("reconnecting");
        retry += 1;
        timer = setTimeout(open, Math.min(1000 * retry, 5000));
      };
    }

    open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [code, token]);

  const send = useCallback(msg => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return { state, connection, send };
}

function RoomSetup({ initialCode, onEnter }) {
  usePageTitle("online 1v1");
  const [tab, setTab] = useState(initialCode ? "join" : "create");
  const [name, setName] = useState("");
  const [playlist, setPlaylist] = useState("");
  const [rounds, setRounds] = useState(5);
  const [code, setCode] = useState(initialCode || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message || "Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const createRoom = () =>
    run(async () => {
      const data = await postJson("/api/rooms", {
        name: name.trim(),
        playlist_id: extractYouTubePlaylistId(playlist),
        num_rounds: rounds,
      });
      onEnter(data.code, { token: data.token, seat: data.seat });
    });

  const joinRoom = () =>
    run(async () => {
      const c = code.trim().toUpperCase();
      const data = await postJson(`/api/rooms/${c}/join`, { name: name.trim() });
      onEnter(data.code, { token: data.token, seat: data.seat });
    });

  const watchRoom = () => {
    const c = code.trim().toUpperCase();
    if (c) onEnter(c, { token: null, seat: null });
  };

  const canCreate = name.trim() && playlist.trim() && rounds >= 2 && rounds <= 10;
  const canJoin = name.trim() && code.trim().length >= 4;

  return (
    <div>
      <h2 className="h-era">online 1v1</h2>
      <p className="mb-3">
        Play from two different computers. One of you makes a room and sends the link, the
        other joins. Rooms use YouTube playlists, and only the host gives out points at the end.
      </p>

      <div className="flex gap-2 mb-3">
        <button type="button" className={`btn ${tab === "create" ? "btn-lime is-on" : ""}`} onClick={() => setTab("create")}>
          Create a room
        </button>
        <button type="button" className={`btn ${tab === "join" ? "btn-lime is-on" : ""}`} onClick={() => setTab("join")}>
          Join a room
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 items-start">
        <fieldset className="fs">
          <legend>{tab === "create" ? "new room" : "join with a code"}</legend>
          <form
            className="flex flex-col gap-2"
            onSubmit={e => {
              e.preventDefault();
              if (tab === "create" ? canCreate : canJoin) (tab === "create" ? createRoom : joinRoom)();
            }}
          >
            <label className="flex flex-col gap-1">
              <span>your name</span>
              <input className="txt" value={name} onChange={e => setName(e.target.value)} maxLength={24} autoComplete="off" />
            </label>

            {tab === "create" ? (
              <>
                <label className="flex flex-col gap-1">
                  <span>YouTube playlist</span>
                  <input
                    className="txt"
                    value={playlist}
                    onChange={e => setPlaylist(e.target.value)}
                    placeholder="playlist URL or ID"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="number"
                    className="txt w-20"
                    min={2}
                    max={10}
                    value={rounds}
                    onChange={e => setRounds(Number(e.target.value))}
                  />
                  <span>rounds</span>
                </label>
                <button type="submit" className="btn btn-red btn-big mt-1" disabled={!canCreate || busy}>
                  {busy ? "Loading playlist..." : "Create room"}
                </button>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1">
                  <span>room code</span>
                  <input
                    className="txt uppercase tracking-widest"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    maxLength={5}
                    autoComplete="off"
                  />
                </label>
                <div className="flex flex-wrap gap-2 mt-1">
                  <button type="submit" className="btn btn-red btn-big" disabled={!canJoin || busy}>
                    {busy ? "Joining..." : "Join as player"}
                  </button>
                  <button type="button" className="btn btn-big" disabled={code.trim().length < 4} onClick={watchRoom}>
                    Just watch
                  </button>
                </div>
              </>
            )}

            {error && (
              <p className="rounded border border-red-300 bg-red-50 text-red-800 px-3 py-2 font-bold" role="alert">
                {error}
              </p>
            )}
          </form>
        </fieldset>

        <div className="box">
          <div className="font-bold mb-1">how rooms work</div>
          <ol className="list-decimal pl-5">
            <li>The host creates a room and copies the invite link.</li>
            <li>Your friend opens the link and joins as player 2.</li>
            <li>You both see and hear the same songs. Only the person whose turn it is can pick.</li>
            <li>At the end, the host gives out the points. Everyone sees them live.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function WaitingRoom({ state, send }) {
  usePageTitle(`room ${state.code}${state.players["2"] ? "" : ", waiting for player 2"}`);
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${window.location.pathname}?room=${state.code}`;
  const p1 = state.players["1"];
  const p2 = state.players["2"];
  const isHost = state.you.is_host;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="h-era !mb-0">room {state.code}</h2>

      <div className="box">
        <div className="font-bold mb-1">invite link</div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="txt flex-1 min-w-0" value={link} readOnly onFocus={e => e.target.select()} aria-label="Invite link" />
          <button type="button" className="btn" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
        </div>
        <div className="small mt-1">or tell them the code: <b>{state.code}</b></div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 items-start">
        <div className="box">
          <div className="font-bold mb-1">players</div>
          <table className="tbl">
            <tbody>
              <tr>
                <td>player 1 (host)</td>
                <td className="font-bold">{p1.name}</td>
                <td className="text-right small">{p1.connected ? "online" : "away"}</td>
              </tr>
              <tr>
                <td>player 2</td>
                <td className="font-bold">{p2 ? p2.name : "waiting..."}</td>
                <td className="text-right small">{p2 ? (p2.connected ? "online" : "away") : ""}</td>
              </tr>
            </tbody>
          </table>
          {state.spectators > 0 && <div className="small mt-2">{state.spectators} watching</div>}
        </div>

        <div className="box">
          <div className="font-bold mb-1">{state.num_rounds} rounds, YouTube playlist</div>
          {isHost ? (
            <>
              <button type="button" className="btn btn-lime btn-big w-full" disabled={!p2} onClick={() => send({ type: "start" })}>
                Start game
              </button>
              {!p2 && <div className="small mt-2 text-center">waiting for player 2 to join</div>}
            </>
          ) : (
            <div>Waiting for {p1.name} to start the game.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function OnlineTurn({ state, send }) {
  const game = state.game;
  const names = { 1: state.players["1"].name, 2: state.players["2"]?.name || "player 2" };
  const mySeat = state.you.seat;
  const myTurn = mySeat === game.active;
  const track = game.choices[game.index];
  const isFinal = game.round === game.num_rounds;
  const activeName = names[game.active];
  const canAct = myTurn && !game.loading;

  const nextLabel = game.active === 1
    ? `${names[2]}'s turn`
    : isFinal
    ? "Finish and see scores"
    : "Next round";

  let status;
  if (game.loading) status = "loading songs...";
  else if (game.error) status = game.error;
  else status = `song ${game.index + 1} of ${game.choices.length}`;

  return (
    <div className="flex flex-col gap-3">
      <TurnView
        heading={myTurn ? `${activeName}, it's your turn!` : `${activeName} is picking...`}
        round={game.round}
        numRounds={game.num_rounds}
        media={<YouTubePlayer videoId={track?.youtube_video_id} title={trackTitle(track)} />}
        status={status}
        player1={names[1]}
        player2={names[2]}
        picked1={game.picks["1"].length}
        picked2={game.picks["2"].length}
        picked={game.picked}
        canPick={canAct && !game.picked && !!track}
        canNext={canAct && game.index < game.choices.length - 1}
        canBack={canAct && game.can_go_back}
        backLabel={isFinal ? "Go back (once)" : "Go back"}
        nextLabel={nextLabel}
        locked={!myTurn}
        lockedText={mySeat ? `Waiting for ${activeName} to pick. You're listening along.` : `You're watching. ${activeName} is picking.`}
        onPick={() => send({ type: "pick" })}
        onNext={() => send({ type: "next" })}
        onBack={() => send({ type: "back" })}
        onAdvance={() => send({ type: "advance" })}
      />
      {game.error && !game.loading && (mySeat === 1 || myTurn) && (
        <div>
          <button type="button" className="btn" onClick={() => send({ type: "retry" })}>Try loading songs again</button>
        </div>
      )}
    </div>
  );
}

function RoomSession({ code, seat, onLeave }) {
  const { state, connection, send } = useRoomSocket(code, seat.token);
  usePageTitle(connection === "notfound" ? "room not found" : state ? null : `joining room ${code}`);

  let body;
  if (connection === "notfound") {
    body = (
      <div className="box">
        <p className="mb-3">Room {code} doesn't exist any more. Rooms reset when the server restarts.</p>
        <button type="button" className="btn btn-lime" onClick={onLeave}>Back to online 1v1</button>
      </div>
    );
  } else if (!state) {
    body = <div className="box">Connecting to room {code}...</div>;
  } else if (state.status === "lobby") {
    body = <WaitingRoom state={state} send={send} />;
  } else if (state.status === "active") {
    body = <OnlineTurn state={state} send={send} />;
  } else {
    const isHost = state.you.is_host;
    const np = state.now_playing;
    const playingTrack = np ? state.game.picks[String(np.player)][np.index] : null;
    body = (
      <Scoreboard
        player1={state.players["1"].name}
        player2={state.players["2"]?.name || "player 2"}
        picks={state.game.picks}
        token={null}
        mode="youtube"
        votes={{ 1: new Set(state.votes["1"]), 2: new Set(state.votes["2"]) }}
        onVote={(player, index) => send({ type: "vote", player, index })}
        canVote={isHost}
        playingTrack={playingTrack}
        onPlay={(player, index) => send({ type: "play", player, index })}
        note={isHost ? undefined : "The host picks what plays and gives out the points. You'll see and hear it all as it happens."}
        onPlayAgain={isHost ? () => send({ type: "rematch" }) : undefined}
        playAgainLabel="Rematch"
      />
    );
  }

  const inGame = state && state.status !== "lobby";
  const p1 = state?.players["1"]?.name;
  const p2 = state?.players["2"]?.name;
  const shellStatus = inGame ? `room ${code}: ${p1} vs ${p2}` : undefined;

  return (
    <RetroShell onGoHome={onLeave} variant={inGame ? "game" : "full"} status={shellStatus}>
      {connection === "reconnecting" && (
        <div className="mb-3 rounded border border-yellow-400 bg-yellow-50 px-3 py-2 font-bold">
          Lost the connection, reconnecting...
        </div>
      )}
      {body}
      {!inGame && state && (
        <div className="mt-3">
          <button type="button" className="btn" onClick={onLeave}>Leave room</button>
        </div>
      )}
    </RetroShell>
  );
}

export default function OnlineRoom({ initialCode, onGoHome }) {
  const [entered, setEntered] = useState(() => {
    if (!initialCode) return null;
    const code = initialCode.toUpperCase();
    const seat = loadSeat(code);
    return seat ? { code, seat } : null;
  });

  function enter(code, seat) {
    saveSeat(code, seat);
    setRoomInUrl(code);
    setEntered({ code, seat });
  }

  function leave() {
    setRoomInUrl(null);
    setEntered(null);
    onGoHome();
  }

  if (entered) {
    return <RoomSession key={entered.code} code={entered.code} seat={entered.seat} onLeave={leave} />;
  }

  return (
    <RetroShell onGoHome={leave}>
      <RoomSetup initialCode={initialCode} onEnter={enter} />
    </RetroShell>
  );
}
