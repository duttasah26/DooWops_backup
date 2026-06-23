import { useState, useEffect } from "react";
import GamePage from "./GamePage";
import LoginPage from "./LoginPage";
import Lobby from "./Lobby";
import Scoreboard from "./Scoreboard";
import Particles from "react-tsparticles";
import { loadSlim } from "tsparticles-slim";
import { FaSpotify } from "react-icons/fa";
import "./App.css";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

const PARTICLES_OPTIONS = {
  background: { color: "transparent" },
  fpsLimit: 60,
  particles: {
    color: { value: "#ffffff" },
    links: { enable: true, color: "#ffffff", distance: 150, opacity: 0.2, width: 1 },
    move: { enable: true, speed: 0.5 },
    number: { value: 40 },
    opacity: { value: 0.3 },
    size: { value: { min: 1, max: 3 } },
  },
};

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

  // YouTube mode bypasses Spotify auth entirely
  if (youtubeMode) {
    if (phase === "lobby") {
      return (
        <div className="min-h-screen bg-gradient-to-br from-purple-900 to-black text-white flex flex-col items-center justify-center">
          <div className="absolute top-4 left-6 flex items-center gap-2 z-50">
            <FaSpotify className="text-green-500 text-3xl" />
            <h1 className="text-3xl font-bold">DooWops</h1>
          </div>
          <Lobby
            token={null}
            initialMode="youtube"
            onStart={settings => {
              setGameSettings(settings);
              setFinalPicks(null);
              setPhase("game");
            }}
          />
        </div>
      );
    }
    if (phase === "game") {
      return (
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
      );
    }
    if (phase === "scoreboard") {
      return (
        <Scoreboard
          player1={gameSettings.player1}
          player2={gameSettings.player2}
          picks={finalPicks}
          token={null}
          mode="youtube"
        />
      );
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-900 to-black text-white">
        <Particles id="tsparticles" init={loadSlim} options={PARTICLES_OPTIONS} />
        <div className="absolute top-4 left-6 flex items-center gap-2 z-50">
          <FaSpotify className="text-green-500 text-3xl" />
          <h1 className="text-3xl font-bold">DooWops</h1>
        </div>
        <h2 className="text-xl mt-24">Connecting to Spotify...</h2>
      </div>
    );
  }

  if (!token || tokenError) {
    return (
      <LoginPage
        error={tokenError ? "Spotify session expired. Please log in again." : undefined}
        onYouTubeMode={() => {
          setYoutubeMode(true);
          setLoading(false);
        }}
      />
    );
  }

  if (phase === "lobby") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 to-black text-white flex flex-col items-center justify-center">
        <Particles id="tsparticles" init={loadSlim} options={PARTICLES_OPTIONS} />
        <div className="absolute top-4 left-6 flex items-center gap-2 z-50">
          <FaSpotify className="text-green-500 text-3xl" />
          <h1 className="text-3xl font-bold">DooWops</h1>
        </div>
        <Lobby
          token={token}
          initialMode="spotify"
          onStart={settings => {
            setGameSettings(settings);
            setFinalPicks(null);
            setPhase("game");
          }}
        />
      </div>
    );
  }

  if (phase === "game") {
    return (
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
    );
  }

  if (phase === "scoreboard") {
    return (
      <Scoreboard
        player1={gameSettings.player1}
        player2={gameSettings.player2}
        picks={finalPicks}
        token={token}
        mode={gameSettings.mode || "spotify"}
      />
    );
  }

  return null;
}
