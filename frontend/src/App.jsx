import { useState, useEffect } from "react";
import GamePage from "./GamePage";
import LoginPage from "./LoginPage";
import Lobby from "./Lobby";
import Scoreboard from "./Scoreboard";
import RetroShell from "./components/RetroShell";
import OnlineRoom from "./OnlineRoom";
import usePageTitle from "./usePageTitle";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

function roomFromUrl() {
  try {
    return new URL(window.location.href).searchParams.get("room") || "";
  } catch {
    return "";
  }
}

export default function App() {
  const [token, setToken] = useState("");
  const [tokenError, setTokenError] = useState(false);
  const [loading, setLoading] = useState(true);

  // home (landing page) -> lobby (local setup) -> game -> scoreboard, or online rooms
  const [roomCode] = useState(roomFromUrl);
  const [phase, setPhase] = useState(() => (roomFromUrl() ? "online" : "home"));
  const [lobbyMode, setLobbyMode] = useState("youtube");
  const [gameSettings, setGameSettings] = useState(null);
  const [finalPicks, setFinalPicks] = useState(null);

  useEffect(() => {
    const hash = window.location.hash;
    const storedToken = localStorage.getItem("spotify_token");
    if (!storedToken && hash) {
      const params = new URLSearchParams(hash.substring(1));
      const t = params.get("access_token");
      if (t) {
        localStorage.setItem("spotify_token", t);
        setToken(t);
        window.history.replaceState(null, null, " ");
      }
    } else if (storedToken) {
      setToken(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    const verify = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${BACKEND_URL}/api/playlist/6utZxFzH2JKGp944C3taxO`);
        if (!res.ok) {
          setTokenError(true);
          setToken("");
          localStorage.removeItem("spotify_token");
        } else {
          setTokenError(false);
        }
      } catch {
        setTokenError(true);
        setToken("");
        localStorage.removeItem("spotify_token");
      } finally {
        setLoading(false);
      }
    };
    verify();
  }, [token]);

  const spotifyReady = !!token && !tokenError;
  usePageTitle(phase === "home" && loading ? "connecting to Spotify" : null);
  const goHome = () => setPhase("home");
  const openLobby = mode => {
    setLobbyMode(mode);
    setPhase("lobby");
  };

  if (phase === "online") {
    return <OnlineRoom initialCode={roomCode} onGoHome={goHome} />;
  }

  if (phase === "lobby") {
    return (
      <RetroShell onGoHome={goHome}>
        <Lobby
          key={lobbyMode}
          token={spotifyReady ? token : null}
          initialMode={lobbyMode}
          onStart={settings => {
            setGameSettings(settings);
            setFinalPicks(null);
            setPhase("game");
          }}
        />
      </RetroShell>
    );
  }

  if (phase === "game") {
    const mode = gameSettings.mode || "spotify";
    return (
      <RetroShell onGoHome={goHome} variant="game" status={`${gameSettings.player1} vs ${gameSettings.player2}`}>
        <GamePage
          token={mode === "spotify" ? token : null}
          playlistId={gameSettings.playlistId}
          player1={gameSettings.player1}
          player2={gameSettings.player2}
          numRounds={gameSettings.numRounds}
          mode={mode}
          setTokenError={mode === "spotify" ? setTokenError : () => {}}
          onGameEnd={({ picks }) => {
            setFinalPicks(picks);
            setPhase("scoreboard");
          }}
        />
      </RetroShell>
    );
  }

  if (phase === "scoreboard") {
    const mode = gameSettings.mode || "spotify";
    return (
      <RetroShell onGoHome={goHome} variant="game" status="final scores">
        <Scoreboard
          player1={gameSettings.player1}
          player2={gameSettings.player2}
          picks={finalPicks}
          token={mode === "spotify" ? token : null}
          mode={mode}
          onPlayAgain={() => setPhase("lobby")}
        />
      </RetroShell>
    );
  }

  return (
    <RetroShell onGoHome={goHome}>
      {loading ? (
        <p className="mt-4 text-center font-bold">Connecting to Spotify...</p>
      ) : (
        <LoginPage
          spotifyReady={spotifyReady}
          error={tokenError ? "Spotify session expired. Please log in again." : undefined}
          onSpotify={() => openLobby("spotify")}
          onYouTubeMode={() => openLobby("youtube")}
          onOnline={() => setPhase("online")}
        />
      )}
    </RetroShell>
  );
}
