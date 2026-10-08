import { useState, useRef, useEffect } from "react";
import WebPlayback from "./WebPlayback";
import YouTubePlayer from "./YouTubePlayer";
import usePageTitle from "./usePageTitle";

async function activateBrowserDevice(deviceId, token, maxRetries = 15) {
  if (!deviceId || !token) return false;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const devicesRes = await fetch("https://api.spotify.com/v1/me/player/devices", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!devicesRes.ok) {
        if (devicesRes.status === 401 || devicesRes.status === 403) return false;
        continue;
      }
      const devicesData = await devicesRes.json();
      const targetDevice = devicesData.devices?.find(d => d.id === deviceId);
      if (!targetDevice) {
        await new Promise(r => setTimeout(r, 500 + attempt * 100));
        continue;
      }
      if (targetDevice.is_active) return true;

      const transferRes = await fetch("https://api.spotify.com/v1/me/player", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ device_ids: [deviceId], play: false }),
      });
      if (transferRes.ok || transferRes.status === 202 || transferRes.status === 204) {
        await new Promise(r => setTimeout(r, 1000));
        const verifyRes = await fetch("https://api.spotify.com/v1/me/player/devices", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          if (verifyData.devices?.find(d => d.id === deviceId && d.is_active)) return true;
        }
      }
      await new Promise(r => setTimeout(r, 500 + attempt * 100));
    } catch {}
  }
  return false;
}

async function playTrackSafely(deviceId, token, trackUri, maxRetries = 8) {
  if (!deviceId || !token || !trackUri) return false;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const devicesRes = await fetch("https://api.spotify.com/v1/me/player/devices", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (devicesRes.ok) {
        const devicesData = await devicesRes.json();
        const activeDevice = devicesData.devices?.find(d => d.id === deviceId && d.is_active);
        if (activeDevice) {
          const playRes = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ uris: [trackUri] }),
          });
          if (playRes.ok || playRes.status === 202 || playRes.status === 204) return true;
        }
      }
      await new Promise(r => setTimeout(r, 500 + attempt * 100));
    } catch {}
  }
  return false;
}

// Voting is local by default. Online rooms pass `votes` + `onVote` so the
// server holds the points, and `canVote={false}` for everyone but the host.
// `playingTrack` + `onPlay` do the same for the song being played back, so the
// guest's player follows whatever the host clicks.
export default function Scoreboard({
  player1,
  player2,
  picks,
  token,
  mode = "spotify",
  onPlayAgain,
  playAgainLabel = "Play again",
  votes,
  onVote,
  canVote = true,
  note,
  playingTrack,
  onPlay,
}) {
  usePageTitle("final scores");
  const [localVotes, setLocalVotes] = useState({ 1: new Set(), 2: new Set() });
  const selected = votes || localVotes;
  const [localTrack, setActiveTrack] = useState(null);
  const activeTrack = onPlay ? playingTrack : localTrack;
  const [webplayDeviceId, setWebplayDeviceId] = useState(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [activating, setActivating] = useState(false);

  const lastPlayedRef = useRef("");
  const activationAttempted = useRef(false);

  useEffect(() => {
    if (mode !== "spotify" || !webplayDeviceId || !token || activationAttempted.current) return;
    activationAttempted.current = true;
    setActivating(true);
    activateBrowserDevice(webplayDeviceId, token).then(success => {
      setPlayerReady(success);
      setActivating(false);
    });
  }, [webplayDeviceId, token, mode]);

  function togglePick(playerNum, idx) {
    if (onVote) {
      onVote(playerNum, idx);
      return;
    }
    setLocalVotes(sel => {
      const next = { 1: new Set(sel[1]), 2: new Set(sel[2]) };
      if (next[playerNum].has(idx)) next[playerNum].delete(idx);
      else next[playerNum].add(idx);
      return next;
    });
  }

  async function handleCardClick(track, playerNum, index) {
    if (onPlay) {
      if (canVote) onPlay(playerNum, index);
      return;
    }
    setActiveTrack(track);
    if (mode === "youtube") return; // YouTubePlayer renders automatically from activeTrack

    if (webplayDeviceId && token && track?.uri && playerReady) {
      const trackKey = track.uri + "|" + webplayDeviceId;
      if (lastPlayedRef.current === trackKey) return;
      lastPlayedRef.current = trackKey;
      await playTrackSafely(webplayDeviceId, token, track.uri);
    }
  }

  async function retryDeviceActivation() {
    if (!webplayDeviceId || !token) return;
    setActivating(true);
    setPlayerReady(false);
    activationAttempted.current = false;
    const success = await activateBrowserDevice(webplayDeviceId, token);
    setPlayerReady(success);
    setActivating(false);
    if (success && activeTrack?.uri) {
      await playTrackSafely(webplayDeviceId, token, activeTrack.uri);
    }
    activationAttempted.current = true;
  }

  const score1 = selected[1].size;
  const score2 = selected[2].size;

  function renderPlayerColumn(playerNum, picksArr, playerName) {
    const pts = selected[playerNum].size;
    return (
      <div className="flex-1 min-w-0">
        <h3 className="h-era !text-[20px]">{playerName}'s picks ({pts} {pts === 1 ? "point" : "points"})</h3>
        <div className="box !p-2">
          <table className="tbl">
            <tbody>
              {picksArr.map((track, i) => {
                const playing = activeTrack?.uri === track.uri;
                const on = selected[playerNum].has(i);
                return (
                  <tr
                    key={i}
                    className={`${!onPlay || canVote ? "cursor-pointer" : ""} ${on ? "on" : ""}`}
                    onClick={e => {
                      if (e.target.closest("button")) return;
                      handleCardClick(track, playerNum, i);
                    }}
                    title={!onPlay || canVote ? "Click to play" : undefined}
                  >
                    <td className="w-14">
                      <img
                        src={track.album.images[1]?.url || track.album.images[0]?.url || ""}
                        className="w-11 h-11 object-cover rounded block"
                        alt=""
                        draggable={false}
                      />
                    </td>
                    <td className="max-w-0 w-full">
                      <div className="font-bold truncate">{track.name}</div>
                      <div className="small truncate">
                        {playing ? "now playing" : track.artists.map(a => a.name).join(", ")}
                        {mode === "spotify" && !track.preview_url && ", no preview"}
                      </div>
                    </td>
                    <td className="w-[88px] text-right">
                      {canVote ? (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); togglePick(playerNum, i); }}
                          className={`btn ${on ? "btn-lime is-on" : ""}`}
                          aria-pressed={on}
                        >
                          {on ? "+1 given" : "+1"}
                        </button>
                      ) : (
                        on && <span className="font-bold text-retro-olive">+1</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const winner = score1 === score2 ? null : score1 > score2 ? player1 : player2;
  const activeTitle = activeTrack
    ? `${activeTrack.name} - ${activeTrack.artists.map(a => a.name).join(", ")}`
    : "click a song below to play it";

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="h-era !mb-0">final scores</h2>
        <span className="font-bold">
          {player1} {score1} &nbsp;|&nbsp; {player2} {score2}
        </span>
      </div>

      {mode === "youtube" ? (
        <YouTubePlayer videoId={activeTrack?.youtube_video_id} title={activeTitle} />
      ) : (
        <div className="win">
          <div className="win-title"><span className="truncate">{activeTitle}</span></div>
          <div className="win-body">
            {activeTrack ? (
              <>
                <WebPlayback
                  token={token}
                  trackUri={activeTrack.uri}
                  onReady={setWebplayDeviceId}
                  previewUrl={activeTrack?.preview_url}
                />
                {(!playerReady || activating) && (
                  <div className="pt-2 text-center">
                    <button onClick={retryDeviceActivation} disabled={activating} className="btn btn-lime" type="button">
                      {activating ? "Activating..." : "Activate Spotify Player"}
                    </button>
                    <div className="small mt-1">
                      {activating
                        ? "Connecting to Spotify..."
                        : "If this doesn't work, open the Spotify app and select 'Doowops Player' from devices."}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="py-8 text-center">nothing playing yet</div>
            )}
          </div>
        </div>
      )}

      <div className="box flex flex-wrap items-center justify-between gap-3">
        <span className="font-bold text-[20px]">
          {winner ? `${winner} is winning!` : score1 === 0 ? "No points given yet." : "It's a tie!"}
        </span>
        <span>{note || "Click a song to play it, then give a +1 to every pick you liked."}</span>
        {onPlayAgain && (
          <button type="button" onClick={onPlayAgain} className="btn btn-big btn-lime">
            {playAgainLabel}
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-3 items-start">
        {renderPlayerColumn(1, picks[1], player1)}
        {renderPlayerColumn(2, picks[2], player2)}
      </div>
    </div>
  );
}
