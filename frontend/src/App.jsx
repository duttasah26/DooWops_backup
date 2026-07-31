import { useState, useEffect } from "react";
import { ghostCursor } from "cursor-effects";
import GamePage from "./GamePage";
import LoginPage from "./LoginPage";
import Lobby from "./Lobby";
import Scoreboard from "./Scoreboard";
import RetroShell from "./components/RetroShell";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

export default function App() {
  const [token, setToken] = useState("");
  const [tokenError, setTokenError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [youtubeMode, setYoutubeMode] = useState(false);

  const [phase, setPhase] = useState("lobby");
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

  useEffect(() => {
    const cursorEffect = new ghostCursor();
    return () => cursorEffect.destroy();
  }, []);

  const handleGoHome = () => setPhase("lobby");

  // YouTube mode bypasses Spotify auth entirely
  if (youtubeMode) {
    if (phase === "lobby") {
      return (
        <RetroShell onGoHome={handleGoHome}>
          <Lobby
            token={null}
            initialMode="youtube"
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
      return (
        <RetroShell onGoHome={handleGoHome}>
          <GamePage
            token={null}
            playlistId={gameSettings.playlistId}
            player1={gameSettings.player1}
            player2={gameSettings.player2}
            numRounds={gameSettings.numRounds}
            mode="youtube"
            setTokenError={() => {}}
            onGameEnd={({ picks }) => {
              setFinalPicks(picks);
              setPhase("scoreboard");
            }}
          />
        </RetroShell>
      );
    }
    if (phase === "scoreboard") {
      return (
        <RetroShell onGoHome={handleGoHome}>
          <Scoreboard
            player1={gameSettings.player1}
            player2={gameSettings.player2}
            picks={finalPicks}
            token={null}
            mode="youtube"
          />
        </RetroShell>
      );
    }
  }

  if (loading) {
    return (
      <RetroShell onGoHome={handleGoHome}>
        <h2 className="text-xl mt-4 text-center">Connecting to Spotify...</h2>
      </RetroShell>
    );
  }

  if (!token || tokenError) {
    return (
      <RetroShell onGoHome={handleGoHome}>
        <LoginPage
          error={tokenError ? "Spotify session expired. Please log in again." : undefined}
          onYouTubeMode={() => {
            setYoutubeMode(true);
            setLoading(false);
          }}
        />
      </RetroShell>
    );
  }

  if (phase === "lobby") {
    return (
      <RetroShell onGoHome={handleGoHome}>
        <Lobby
          token={token}
          initialMode="spotify"
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
    return (
      <RetroShell onGoHome={handleGoHome}>
        <GamePage
          token={token}
          playlistId={gameSettings.playlistId}
          player1={gameSettings.player1}
          player2={gameSettings.player2}
          numRounds={gameSettings.numRounds}
          mode={gameSettings.mode || "spotify"}
          setTokenError={setTokenError}
          onGameEnd={({ picks }) => {
            setFinalPicks(picks);
            setPhase("scoreboard");
          }}
        />
      </RetroShell>
    );
  }

  if (phase === "scoreboard") {
    return (
      <RetroShell onGoHome={handleGoHome}>
        <Scoreboard
          player1={gameSettings.player1}
          player2={gameSettings.player2}
          picks={finalPicks}
          token={token}
          mode={gameSettings.mode || "spotify"}
        />
      </RetroShell>
    );
  }

  return null;
}
