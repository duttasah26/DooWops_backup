import React from "react";
import { FaSpotify, FaYoutube } from "react-icons/fa";
import YouTubePlayer from "./YouTubePlayer";
import usePageTitle from "./usePageTitle";

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

export default function LoginPage({ error, spotifyReady, onSpotify, onYouTubeMode, onOnline }) {
  usePageTitle("home");
  return (
    <div className="flex flex-col gap-3">
      <h2 className="h-era">hello everyone, welcome to doo-wops!</h2>

      <div className="box">
        <p className="mb-3">
          doo-wops is a 1v1 song game: take turns picking tracks from a playlist, then
          score each other's picks at the end. Log in with Spotify to use your own
          playlists, or jump straight in with YouTube mode, no account needed.
        </p>
        {error && (
          <p className="mb-3 rounded border border-red-300 bg-red-50 text-red-800 px-3 py-2 font-bold">{error}</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {spotifyReady ? (
            <button type="button" onClick={onSpotify} className="btn btn-lime btn-big">
              <FaSpotify /> Play with Spotify
            </button>
          ) : (
            <a href={`${BACKEND_URL}/auth/login`} className="btn btn-lime btn-big">
              <FaSpotify /> Login with Spotify
            </a>
          )}
          <span>or</span>
          <button type="button" onClick={onYouTubeMode} className="btn btn-red btn-big">
            <FaYoutube /> Play with YouTube
          </button>
        </div>
      </div>

      <div className="box flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-bold">online 1v1</div>
          <div>Play a friend on their own computer. Make a room, send them the link.</div>
        </div>
        <button type="button" onClick={onOnline} className="btn btn-red btn-big">
          <FaYoutube /> Play online
        </button>
      </div>

      <div className="btnwall">
        {BUTTON_GIFS.map(name => <img key={name} src={`/buttons/${name}`} alt="" />)}
      </div>

      <h2 className="h-era mt-1">featured song</h2>
      <YouTubePlayer videoId="dQw4w9WgXcQ" title="Rick Astley - Never Gonna Give You Up" autoplay={false} />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="box">
          <div className="font-bold mb-1">how to play</div>
          <ol className="list-decimal pl-5">
            <li>Pick a playlist and enter both names.</li>
            <li>Each round you hear 3 songs and keep one.</li>
            <li>The last round has 5 songs to choose from.</li>
            <li>At the end, play every pick back and hand out points.</li>
          </ol>
        </div>
        <div className="box">
          <div className="font-bold mb-1">modes</div>
          <p className="mb-2"><b>Spotify:</b> your own playlists, full tracks with Premium.</p>
          <p><b>YouTube:</b> any public playlist, videos play right on the page.</p>
        </div>
      </div>
    </div>
  );
}
