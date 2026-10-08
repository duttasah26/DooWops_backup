import React, { useState, useEffect } from "react";
import { FaSpotify, FaYoutube, FaPlus } from "react-icons/fa";
import usePageTitle from "./usePageTitle";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

const HARDCODED_PLAYLISTS = [
  {
    name: "9X-FM",
    id: "6utZxFzH2JKGp944C3taxO",
    url: "https://open.spotify.com/playlist/6utZxFzH2JKGp944C3taxO"
  },
  {
    name: "Sangeet Bangla FM",
    id: "5HmrH4b9CB1AgkQxqlkscV",
    url: "https://open.spotify.com/playlist/5HmrH4b9CB1AgkQxqlkscV"
  },
  {
    name: "106.2 AMAR FM",
    id: "42zqvt1YVP0hhErybNdDj1",
    url: "https://open.spotify.com/playlist/42zqvt1YVP0hhErybNdDj1"
  }
];

function extractSpotifyPlaylistId(str) {
  if (!str) return "";
  let v = str.trim();
  if (v.startsWith("https://open.spotify.com/playlist/")) {
    v = v.split("/playlist/")[1].split("?")[0];
  }
  return v;
}

function extractYouTubePlaylistId(str) {
  if (!str) return "";
  let v = str.trim();
  try {
    const url = new URL(v);
    const list = url.searchParams.get("list");
    if (list) return list;
  } catch {}
  return v;
}

async function fetchPlaylistCover(playlistId, token) {
  try {
    const res = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.images?.[0]?.url || null;
  } catch {
    return null;
  }
}

export default function Lobby({ onStart, token, initialMode = "spotify" }) {
  usePageTitle("start a 1v1");
  const [mode, setMode] = useState(initialMode);

  // Spotify mode state
  const [playlistCovers, setPlaylistCovers] = useState({});
  const [chosenId, setChosenId] = useState(HARDCODED_PLAYLISTS[0].id);
  const [customInputOpen, setCustomInputOpen] = useState(false);
  const [customPlaylist, setCustomPlaylist] = useState("");

  // YouTube mode state
  const [ytPlaylistInput, setYtPlaylistInput] = useState("");

  // Shared state
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [numRounds, setNumRounds] = useState(5);

  useEffect(() => {
    if (mode !== "spotify" || !token) return;
    let cancelled = false;
    (async () => {
      const covers = {};
      for (const p of HARDCODED_PLAYLISTS) {
        covers[p.id] = null;
        try {
          const url = await fetchPlaylistCover(p.id, token);
          covers[p.id] = url;
        } catch {}
      }
      if (!cancelled) setPlaylistCovers(covers);
    })();
    return () => { cancelled = true; };
  }, [token, mode]);

  const spotifyPlaylistId = customInputOpen
    ? extractSpotifyPlaylistId(customPlaylist)
    : chosenId;
  const spotifyValid = customInputOpen ? !!spotifyPlaylistId : !!chosenId;

  const ytPlaylistId = extractYouTubePlaylistId(ytPlaylistInput);
  const ytValid = !!ytPlaylistId;

  const canStart = mode === "spotify"
    ? (spotifyValid && !!player1.trim() && !!player2.trim() && numRounds >= 2)
    : (ytValid && !!player1.trim() && !!player2.trim() && numRounds >= 2);

  function handleStart() {
    if (!canStart) return;
    if (mode === "spotify") {
      onStart({
        playlistId: spotifyPlaylistId,
        player1: player1.trim(),
        player2: player2.trim(),
        numRounds,
        mode: "spotify",
      });
    } else {
      onStart({
        playlistId: ytPlaylistId,
        player1: player1.trim(),
        player2: player2.trim(),
        numRounds,
        mode: "youtube",
      });
    }
  }

  const customSelected = customInputOpen;
  const pickSpotify = id => { setCustomInputOpen(false); setChosenId(id); };

  return (
    <div>
      <h2 className="h-era">start a 1v1</h2>

      <div className="grid gap-3 md:grid-cols-2 items-start">
        <div className="flex flex-col gap-3">
          <fieldset className="fs">
            <legend>1. music source</legend>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("spotify")}
                className={`btn ${mode === "spotify" ? "btn-lime is-on" : ""}`}
                aria-pressed={mode === "spotify"}
              >
                <FaSpotify /> Spotify
              </button>
              <button
                type="button"
                onClick={() => setMode("youtube")}
                className={`btn ${mode === "youtube" ? "btn-red is-on" : ""}`}
                aria-pressed={mode === "youtube"}
              >
                <FaYoutube /> YouTube
              </button>
            </div>
          </fieldset>

          <fieldset className="fs">
            <legend>2. playlist</legend>

            {mode === "spotify" && (
              <>
                {!token && (
                  <p className="mb-2">
                    Spotify mode needs a login. <a href={`${BACKEND_URL}/auth/login`}>Log in with Spotify</a>
                  </p>
                )}
                <table className="tbl">
                  <tbody>
                    {HARDCODED_PLAYLISTS.map(p => {
                      const on = !customSelected && chosenId === p.id;
                      return (
                        <tr key={p.id} className={`cursor-pointer ${on ? "on" : ""}`} onClick={() => pickSpotify(p.id)}>
                          <td className="w-7">
                            <input type="radio" name="playlist" checked={on} onChange={() => pickSpotify(p.id)} aria-label={p.name} />
                          </td>
                          <td className="w-14">
                            {playlistCovers[p.id] ? (
                              <img src={playlistCovers[p.id]} alt="" className="w-11 h-11 object-cover rounded block" />
                            ) : (
                              <div className="w-11 h-11 rounded bg-white border border-[#c3c9b4] flex items-center justify-center text-retro-green text-xl">
                                <FaSpotify />
                              </div>
                            )}
                          </td>
                          <td className="font-bold">{p.name}</td>
                          <td className="text-right">
                            <a rel="noreferrer" target="_blank" href={p.url} onClick={e => e.stopPropagation()}>view</a>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className={`cursor-pointer ${customSelected ? "on" : ""}`} onClick={() => setCustomInputOpen(true)}>
                      <td>
                        <input type="radio" name="playlist" checked={customSelected} onChange={() => setCustomInputOpen(true)} aria-label="Custom playlist" />
                      </td>
                      <td>
                        <div className="w-11 h-11 rounded bg-white border border-[#c3c9b4] flex items-center justify-center text-xl">
                          <FaPlus />
                        </div>
                      </td>
                      <td colSpan={2} className="font-bold">custom playlist</td>
                    </tr>
                  </tbody>
                </table>
                {customSelected && (
                  <div className="mt-2">
                    <input
                      type="text"
                      className="txt w-full"
                      placeholder="Spotify playlist URL or ID"
                      value={customPlaylist}
                      onChange={e => setCustomPlaylist(e.target.value)}
                      autoFocus
                    />
                  </div>
                )}
              </>
            )}

            {mode === "youtube" && (
              <div>
                <input
                  type="text"
                  className="txt w-full"
                  placeholder="YouTube playlist URL or ID"
                  value={ytPlaylistInput}
                  onChange={e => setYtPlaylistInput(e.target.value)}
                  autoFocus
                />
                <div className="small mt-1">
                  e.g. https://www.youtube.com/playlist?list=PL... or just the playlist ID
                </div>
              </div>
            )}
          </fieldset>
        </div>

        <div className="flex flex-col gap-3">
          <fieldset className="fs">
            <legend>3. players</legend>
            <div className="flex flex-col gap-2">
              <input
                value={player1}
                onChange={e => setPlayer1(e.target.value)}
                placeholder="Player 1 name"
                aria-label="Player 1 name"
                className="txt w-full"
                autoComplete="off"
              />
              <div className="font-bold text-retro-olive text-center">vs</div>
              <input
                value={player2}
                onChange={e => setPlayer2(e.target.value)}
                placeholder="Player 2 name"
                aria-label="Player 2 name"
                className="txt w-full"
                autoComplete="off"
              />
            </div>
          </fieldset>

          <fieldset className="fs">
            <legend>4. rounds</legend>
            <label className="flex items-center gap-2">
              <input
                type="number"
                className="txt w-20"
                min={2}
                max={10}
                value={numRounds}
                onChange={e => setNumRounds(Number(e.target.value))}
                aria-label="Number of rounds"
              />
              <span>rounds (the last round has 5 songs)</span>
            </label>
          </fieldset>

          <div className="box">
            <button type="button" className="btn btn-lime btn-big w-full" onClick={handleStart} disabled={!canStart}>
              Start Game
            </button>
            {!canStart && (
              <div className="small mt-2 text-center">pick a playlist, enter both names and at least 2 rounds</div>
            )}
          </div>

          <div className="box">
            <div className="font-bold mb-1">how to play</div>
            <div>Each round, both players get 3 songs to listen through and pick one. At the end, play everything back and give a point to every pick you liked.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
