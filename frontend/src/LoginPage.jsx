import React from "react";
import { FaSpotify, FaYoutube } from "react-icons/fa";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

const BUTTON_GIFS = [
  "4music.gif",
  "538-turnmeon.gif",
  "daft-punk.gif",
  "itv3.gif",
  "kiss.gif",
  "london2012.gif",
  "more4.gif",
  "nokia.gif",
  "nrkp3.gif",
  "pool.gif",
  "radio-activity.gif",
  "techno.gif",
  "vevo.gif",
  "y2k4.gif",
];

export default function LoginPage({ error, onYouTubeMode }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-3">
      <h2 className="text-3xl font-display italic text-retro-olive">Hello everyone, welcome to doo-wops!</h2>
      <p className="text-sm text-gray-700 max-w-sm">
        Log in with Spotify to play with your own playlists, or jump straight in with YouTube mode.
      </p>
      {error && (
        <div className="text-red-700 font-semibold max-w-xs border border-red-300 bg-red-50 px-4 py-2 rounded">
          {error}
        </div>
      )}
      <a
        href={`${BACKEND_URL}/auth/login`}
        className="flex items-center gap-2 bg-green-600 px-6 py-3 text-white rounded-lg font-bold shadow border border-black/20 hover:bg-green-700 transition text-lg"
      >
        <FaSpotify /> Login with Spotify
      </a>
      <div className="text-gray-500 text-sm">or</div>
      <button
        onClick={onYouTubeMode}
        className="flex items-center gap-2 bg-red-700 px-6 py-3 text-white rounded-lg font-bold shadow border border-black/20 hover:bg-red-800 transition text-lg"
      >
        <FaYoutube /> Play with YouTube
      </button>
      <p className="text-xs text-gray-500 max-w-xs">
        YouTube mode uses YouTube playlists — no Spotify account needed.
      </p>

      <div className="w-full border border-gray-300 bg-white overflow-hidden">
        <div className="flex w-max seamless-marquee-track">
          {[...BUTTON_GIFS, ...BUTTON_GIFS].map((name, i) => (
            <img
              key={name + i}
              src={`/buttons/${name}`}
              alt=""
              className="w-[150px] h-[20px] mx-0.5 pixelated shrink-0"
            />
          ))}
        </div>
      </div>

      <div className="w-full text-left">
        <div className="bg-retro-blue text-white font-bold text-sm px-3 py-1.5 rounded-t flex items-center gap-1">
          ★ featured song
        </div>
        <div className="border border-t-0 border-gray-300 bg-black">
          <iframe
            className="w-full aspect-video"
            src="https://www.youtube.com/embed/dQw4w9WgXcQ"
            title="Featured Song"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
