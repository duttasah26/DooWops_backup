import { useEffect, useState, useRef } from "react";
import WebPlayback from "./WebPlayback";
import YouTubePlayer from "./YouTubePlayer";
import TurnView from "./TurnView";
import { trackTitle } from "./trackTitle";

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

  const isFinalRound = currentRound === numRounds;
  const goBackUsedAlready = goBackUsed[activePlayer] === true;
  const showGoBackBtn =
    (isFinalRound && choiceIndex > 0 && !goBackUsedAlready)
    || (!isFinalRound && pickedForRound && choiceIndex > 0);

  const nextLabel = activePlayer === 1
    ? `${player2}'s turn`
    : isFinalRound
    ? "Finish and see scores"
    : "Next round";

  const title = trackTitle(displayTrack);
  const media = mode === "youtube" ? (
    <YouTubePlayer videoId={displayTrack?.youtube_video_id} title={title} />
  ) : (
    <div className="win">
      <div className="win-title"><span className="truncate">{title}</span></div>
      <div className="win-video flex items-center justify-center" style={{ aspectRatio: "16 / 9" }}>
        {displayTrack?.album?.images?.[0]?.url ? (
          <img src={displayTrack.album.images[0].url} alt="" className="h-full aspect-square object-cover" />
        ) : (
          <span className="text-gray-400" style={{ lineHeight: "normal" }}>
            {choicesLoading ? "loading songs..." : "no song loaded"}
          </span>
        )}
      </div>
      <div className="win-body">
        <WebPlayback
          token={token}
          trackUri={lastValidTrackUri || undefined}
          onReady={setDeviceId}
          previewUrl={displayTrack?.preview_url}
        />
      </div>
    </div>
  );

  return (
    <TurnView
      heading={`${activeName}, it's your turn!`}
      round={currentRound}
      numRounds={numRounds}
      media={media}
      status={
        choicesLoading && !displayTrack
          ? "loading songs..."
          : displayTrack
          ? `song ${choiceIndex + 1} of ${choices.length}`
          : "no songs found in this playlist"
      }
      player1={player1}
      player2={player2}
      picked1={picks[1]?.length}
      picked2={picks[2]?.length}
      picked={pickedForRound}
      canPick={!pickedForRound && !choicesLoading && !!displayTrack}
      canNext={!!displayTrack && choiceIndex < choices.length - 1 && !choicesLoading}
      canBack={!!showGoBackBtn}
      backLabel={isFinalRound ? "Go back (once)" : "Go back"}
      nextLabel={nextLabel}
      onPick={handlePick}
      onNext={handleNext}
      onBack={handleGoBack}
      onAdvance={handleNextTurnOrRound}
    />
  );
}
