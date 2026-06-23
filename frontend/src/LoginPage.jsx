import React from "react";
import Particles from "react-tsparticles";
import { loadSlim } from "tsparticles-slim";
import { FaSpotify, FaYoutube } from "react-icons/fa";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

export default function LoginPage({ error, onYouTubeMode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-900 to-black text-white">
      <Particles
        id="tsparticles"
        init={loadSlim}
        options={{
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
        }}
      />
      <div className="absolute top-4 left-6 flex items-center gap-2 z-50">
        <FaSpotify className="text-green-500 text-3xl" />
        <h1 className="text-3xl font-bold">DooWops</h1>
      </div>
      <div className="text-center mt-10 flex flex-col items-center gap-4 z-10">
        {error && (
          <div className="mb-2 text-red-400 font-semibold max-w-xs">
            {error}
          </div>
        )}
        <a
          href={`${BACKEND_URL}/auth/login`}
          className="flex items-center gap-2 bg-green-600 px-6 py-3 text-white rounded-lg font-bold shadow hover:bg-green-700 transition text-lg"
        >
          <FaSpotify /> Login with Spotify
        </a>
        <div className="text-gray-500 text-sm">or</div>
        <button
          onClick={onYouTubeMode}
          className="flex items-center gap-2 bg-red-700 px-6 py-3 text-white rounded-lg font-bold shadow hover:bg-red-800 transition text-lg"
        >
          <FaYoutube /> Play with YouTube
        </button>
        <p className="text-xs text-gray-400 max-w-xs">
          YouTube mode uses YouTube playlists — no Spotify account needed.
        </p>
      </div>
    </div>
  );
}
