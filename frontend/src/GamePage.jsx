import { useEffect, useState, useRef } from "react";
import { FaSpotify, FaCheck, FaForward, FaUndo } from "react-icons/fa";
import WebPlayback from "./WebPlayback";
import YouTubePlayer from "./YouTubePlayer";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

async function fetchTracks(playlistId, count, setTokenError, mode = "spotify", exclude = "") {
  try {
    const params = new URLSearchParams({ count });
    if (exclude) params.set("exclude", exclude);
    const endpoint = mode === "youtube"
      ? `${BACKEND_URL}/api/youtube-playlist/${playlistId}?${params}`
      : `${BACKEND_URL}/api/playlist/${playlistId}?${params}`;
    const res = await fetch(endpoint);
    if (!res.ok) {
      setTokenError && setTokenError(true);
      return [];
    }
    const data = await res.json();
    return (data.tracks || []).map(t => t.track ? t.track : t);
  } catch {
    setTokenError && setTokenError(true);
    return [];
  }
}

async function transferToDeviceOnce(deviceId, token, alreadyTransferred) {
  if (!deviceId || !token || alreadyTransferred.current) return;
  await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ device_ids: [deviceId], play: false })
  });
  alreadyTransferred.current = true;
}

async function playTrack(deviceId, token, trackUri) {
  if (!deviceId || !token || !trackUri) return;
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uris: [trackUri] }),
  });
}

export default function GamePage({
  token,
  playlistId,
  player1,
  player2,
  numRounds,
  mode = "spotify",
  setTokenError,
  onGameEnd
}) {
  const [currentRound, setCurrentRound] = useState(1);
  const [activePlayer, setActivePlayer] = useState(1);
  const [choices, setChoices] = useState([]);
  const [choicesLoading, setChoicesLoading] = useState(true);
  const [choiceIndex, setChoiceIndex] = useState(0);
  const [picks, setPicks] = useState({ 1: [], 2: [] });
  const [pickedThisRound, setPickedThisRound] = useState({ 1: null, 2: null });
  const [pickedForRound, setPickedForRound] = useState(null);
  const [goBackUsed, setGoBackUsed] = useState({ 1: false, 2: false });
  const [deviceId, setDeviceId] = useState(null);
  const [lastValidTrackUri, setLastValidTrackUri] = useState(null);

  const prevTrackUri = useRef("");
  const alreadyTransferred = useRef(false);
  const usedTrackIdsRef = useRef(new Set());

  const displayTrack = choices[choiceIndex];
  const playerNames = { 1: player1, 2: player2 };
  const activeName = playerNames[activePlayer];

  useEffect(() => {
    setChoicesLoading(true);
    setChoiceIndex(0);
    setPickedForRound(null);
    setGoBackUsed({ 1: false, 2: false });
    prevTrackUri.current = "";
    const count = currentRound === numRounds ? 5 : 3;
    const excludeParam = [...usedTrackIdsRef.current].join(",");
    fetchTracks(playlistId, count, setTokenError, mode, excludeParam).then(newChoices => {
      setChoices(newChoices);
      setChoicesLoading(false);
      newChoices.forEach(t => usedTrackIdsRef.current.add(t.uri));
    });
  }, [currentRound, activePlayer, playlistId, numRounds, setTokenError, mode]);

  useEffect(() => {
    if (activePlayer === 1) {
      setPickedThisRound({ 1: null, 2: null });
    }
  }, [currentRound]);

  useEffect(() => {
    setPickedForRound(null);
  }, [activePlayer]);

  useEffect(() => {
    if (displayTrack?.uri) setLastValidTrackUri(displayTrack.uri);
  }, [displayTrack?.uri]);

  useEffect(() => {
    transferToDeviceOnce(deviceId, token, alreadyTransferred);
  }, [deviceId, token]);

  useEffect(() => {
    if (displayTrack?.uri && prevTrackUri.current !== displayTrack.uri) {
      prevTrackUri.current = displayTrack.uri;
    }
  }, [displayTrack?.uri]);

  useEffect(() => {
    if (!choicesLoading && deviceId && displayTrack?.uri && token && mode === "spotify") {
      playTrack(deviceId, token, displayTrack.uri);
    }
  }, [deviceId, displayTrack?.uri, token, choicesLoading, choiceIndex, mode]);

  function handlePick() {
    const pick = choices[choiceIndex];
    setPickedForRound(pick);
    setPickedThisRound(prev => ({ ...prev, [activePlayer]: pick }));
    setPicks(ps => ({ ...ps, [activePlayer]: [...ps[activePlayer], pick] }));
  }

  function handleNext() {
    setChoiceIndex(i => Math.min(choices.length - 1, i + 1));
  }

  function handleGoBack() {
    setChoiceIndex(i => Math.max(0, i - 1));
    if (currentRound === numRounds) {
      setGoBackUsed(prev => ({ ...prev, [activePlayer]: true }));
    }
  }

  function handleNextTurnOrRound() {
    if (activePlayer === 1) {
      setActivePlayer(2);
      setPickedForRound(null);
    } else {
      if (currentRound === numRounds) {
        onGameEnd({ picks });
      } else {
        setCurrentRound(r => r + 1);
        setActivePlayer(1);
        setPickedForRound(null);
      }
    }
  }

  function RoundPickedCard({ track, name }) {
    if (!track) return null;
    return (
      <div
        className="flex flex-row items-center bg-black bg-opacity-95 rounded-xl shadow-md px-3 py-2 mb-2"
        style={{ minWidth: 260, maxWidth: 320 }}
      >
        <img
          src={
            track.album.images[1]?.url ??
            track.album.images[0]?.url ??
            "https://misc.scdn.co/liked-songs/liked-songs-300.png"
          }
          className="rounded-md shadow w-12 h-12 object-cover mr-3"
          alt="picked card cover"
        />
        <div>
          <div className="font-semibold text-base text-white truncate">{track.name}</div>
          <div className="text-xs text-purple-200 truncate">{track.artists.map(a => a.name).join(", ")}</div>
          <div className="text-xs text-[#3eeb65] font-bold mt-1">{name}'s pick</div>
        </div>
      </div>
    );
  }

  const pickedCardStack = (pickedThisRound[1] || pickedThisRound[2]) && (
    <div
      style={{ position: "fixed", top: 32, right: 32, zIndex: 999, minWidth: 260, maxWidth: 340 }}
      className="flex flex-col items-end space-y-2"
    >
      {pickedThisRound[1] && <RoundPickedCard track={pickedThisRound[1]} name={player1} />}
      {pickedThisRound[2] && <RoundPickedCard track={pickedThisRound[2]} name={player2} />}
    </div>
  );

  const isFinalRound = currentRound === numRounds;
  const goBackUsedAlready = goBackUsed[activePlayer] === true;
  const showGoBackBtn =
    (isFinalRound && choiceIndex > 0 && !goBackUsedAlready)
    || (!isFinalRound && pickedForRound && choiceIndex > 0);

  return (
    <div className="min-h-screen w-screen relative bg-gradient-to-br from-purple-900 to-black text-white overflow-x-hidden flex flex-col items-center">
      {pickedCardStack}
      <div className="absolute top-4 left-6 flex items-center gap-2 z-50">
        <FaSpotify className="text-green-500 text-3xl" />
        <h1 className="text-3xl font-bold">DooWops</h1>
      </div>
      <div className="flex items-center justify-center mt-20 mb-8">
        <div className="mr-8 text-lg font-bold">Round {currentRound}/{numRounds}</div>
        <div className="text-md font-semibold bg-gray-800 rounded px-4 py-1">
          {player1}: {picks[1]?.length}/{numRounds} &nbsp;|&nbsp; {player2}: {picks[2]?.length}/{numRounds}
        </div>
      </div>
      <div className="relative w-full flex flex-row items-start justify-center mb-6 max-w-6xl">
        {activePlayer === 1 && (
          <div className="absolute left-0 top-8 ml-8" style={{ minWidth: 160, zIndex: 10 }}>
            <span className="text-3xl font-extrabold text-left text-purple-200 drop-shadow-md tracking-wide block" style={{ lineHeight: 1.18 }}>
              {`${activeName},`}<br />
              <span className="text-2xl font-bold text-white">it's your turn!</span>
            </span>
          </div>
        )}
        {activePlayer === 2 && (
          <div className="absolute right-0 top-8 mr-8" style={{ minWidth: 160, zIndex: 10 }}>
            <span className="text-3xl font-extrabold text-right text-purple-200 drop-shadow-md tracking-wide block" style={{ lineHeight: 1.18 }}>
              {`${activeName},`}<br />
              <span className="text-2xl font-bold text-white">it's your turn!</span>
            </span>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center">
          <div className="mx-auto">
            <div className="bg-zinc-900 rounded-lg p-6 shadow-xl w-80 flex flex-col items-center relative" style={{ minHeight: 420 }}>
              {(choicesLoading && !displayTrack) ? (
                <div className="flex items-center justify-center h-64 w-full text-lg text-gray-400">Loading…</div>
              ) : (
                <>
                  {displayTrack && (
                    <>
                      <img src={displayTrack.album.images[0]?.url} alt="cover" className="rounded w-64" />
                      <h2 className="text-xl font-semibold mt-2 text-center">{displayTrack.name}</h2>
                      <p className="text-sm text-gray-300 text-center">
                        {displayTrack.artists.map(a => a.name).join(", ")}
                      </p>
                      <p className="text-center text-xs text-purple-300 mt-2">
                        Track {choiceIndex + 1}/{choices.length}
                        {currentRound === numRounds && (
                          <span className="ml-2 text-yellow-400">Final round: 5 choices</span>
                        )}
                      </p>
                    </>
                  )}
                </>
              )}
              <div className="w-full flex items-center justify-center mt-4">
                {mode === "youtube" ? (
                  <YouTubePlayer videoId={displayTrack?.youtube_video_id} />
                ) : (
                  <WebPlayback
                    token={token}
                    trackUri={lastValidTrackUri || undefined}
                    onReady={setDeviceId}
                    previewUrl={displayTrack?.preview_url}
                  />
                )}
              </div>
              <div className="flex justify-between items-center mt-6 w-full px-6">
                {showGoBackBtn && (
                  <button onClick={handleGoBack} className="text-yellow-400 text-2xl" title="Go Back">
                    <FaUndo />
                  </button>
                )}
                <button
                  disabled={!!pickedForRound || choicesLoading}
                  onClick={handlePick}
                  className="text-green-400 text-2xl hover:scale-110 transition-all"
                  title="Pick Song"
                >
                  <FaCheck />
                </button>
                <button
                  disabled={!displayTrack || choiceIndex >= choices.length - 1 || choicesLoading}
                  onClick={handleNext}
                  className="text-red-400 text-2xl hover:scale-110 transition-all"
                  title="Next Song"
                >
                  <FaForward />
                </button>
              </div>
            </div>
            {pickedForRound && (
              <div className="flex gap-4 my-3">
                <button
                  onClick={handleNextTurnOrRound}
                  className={
                    activePlayer === 1
                      ? "bg-blue-500 px-4 py-2 rounded text-white font-bold shadow hover:bg-blue-600 transition"
                      : "bg-green-600 px-4 py-2 rounded text-white font-bold shadow hover:bg-green-800 transition"
                  }
                >
                  {activePlayer === 1
                    ? "P2 TURN"
                    : currentRound === numRounds
                    ? "FINISH & SCOREBOARD"
                    : "NEXT ROUND"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
