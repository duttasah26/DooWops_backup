import { useEffect, useState, useRef } from "react";
import { FaPlay, FaPause, FaVolumeUp } from "react-icons/fa";

const WebPlayback = ({ token, trackUri, onReady, previewUrl }) => {
  const [player, setPlayer] = useState(undefined);
  const [isPaused, setPaused] = useState(false);
  const [isActive, setActive] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(1);
  const [volume, setVolume] = useState(80);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!window.Spotify) {
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      document.body.appendChild(script);
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      const playerInstance = new window.Spotify.Player({
        name: "Doowops Player",
        getOAuthToken: cb => cb(token),
        volume: volume / 100,
      });

      setPlayer(playerInstance);

      playerInstance.addListener("ready", ({ device_id }) => {
        onReady(device_id);
      });

      playerInstance.addListener("player_state_changed", (state) => {
        if (!state) return;
        setPaused(state.paused);
        setPosition(state.position);
        setDuration(state.duration);
        setActive(true);
      });

      playerInstance.connect();
    };

    return () => {
      if (player) player.disconnect();
    };
  }, [token]);

  // Stop preview audio when SDK takes over
  useEffect(() => {
    if (isActive && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [isActive]);

  // Play preview when SDK is not ready and previewUrl changes
  useEffect(() => {
    if (!isActive && previewUrl && audioRef.current) {
      audioRef.current.src = previewUrl;
      audioRef.current.play().catch(() => {});
    }
  }, [previewUrl, isActive]);

  // Update seek bar in real time
  useEffect(() => {
    const interval = setInterval(() => {
      player?.getCurrentState()?.then(state => {
        if (state) {
          setPosition(state.position);
          setDuration(state.duration);
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [player]);

  const handleSeek = (e) => {
    const newPos = (e.target.value / 100) * duration;
    player.seek(newPos);
  };

  const handleVolume = (e) => {
    const newVol = parseInt(e.target.value);
    setVolume(newVol);
    player.setVolume(newVol / 100);
  };

  const formatTime = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  if (!isActive) {
    return (
      <div className="text-center p-4 w-full">
        {previewUrl ? (
          <>
            <audio ref={audioRef} controls className="w-full mb-2" />
            <p className="text-xs text-gray-400">30s preview — Spotify Premium required for full track</p>
          </>
        ) : (
          <>
            <audio ref={audioRef} className="hidden" />
            <p className="text-lg font-semibold">🔌 Connect to Spotify</p>
            <p className="text-sm text-gray-400">Open the app and select "Doowops Player".</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 relative w-full">
      {/* Seek Bar */}
      <div className="flex items-center gap-2">
        <span className="text-sm w-12 text-right">{formatTime(position)}</span>
        <input
          type="range"
          min="0"
          max="100"
          value={(position / duration) * 100}
          onChange={handleSeek}
          className="w-full accent-pink-500"
        />
        <span className="text-sm w-12">{formatTime(duration)}</span>
      </div>

      {/* Play/Pause Button */}
      <div className="flex justify-center">
        <button
          onClick={() => player.togglePlay()}
          className="p-3 bg-green-600 text-white rounded-full text-xl hover:scale-110 transition-transform"
        >
          {isPaused ? <FaPlay /> : <FaPause />}
        </button>
      </div>

      {/* Volume - Bottom Right */}
      <div className="fixed bottom-4 right-6 flex items-center gap-2 bg-black/40 p-2 rounded-md z-50">
        <FaVolumeUp />
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={handleVolume}
          className="w-32 accent-white"
        />
      </div>
    </div>
  );
};

export default WebPlayback;
