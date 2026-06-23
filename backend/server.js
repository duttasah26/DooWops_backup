require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const request = require("request");

const app = express();
const PORT = process.env.PORT || 5000;
const REDIRECT_URI = "http://localhost:5000/auth/callback";
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(" Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env file!");
  process.exit(1);
}
process.on('unhandledRejection', err => {
  console.error('UNHANDLED PROMISE REJECTION:', err);
});
process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

// === In-memory state ===
let latest_token = null;
let latest_refresh_token = null;
const playlistCache = {};
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

app.use(cors());
app.use(express.json());

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.get("/tokens", (req, res) => {
  res.json({
    access_token: latest_token,
    refresh_token: latest_refresh_token,
  });
});

app.get("/auth/login", (req, res) => {
  const state = Math.random().toString(36).substring(7);
  const scope = [
    "streaming", "user-read-email", "user-read-private", "user-modify-playback-state",
    "user-read-playback-state", "user-read-currently-playing", "app-remote-control",
    "playlist-read-private"
  ].join(" ");
  const query = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope,
    redirect_uri: REDIRECT_URI,
    state,
    show_dialog: "true"
  });
  res.redirect(`https://accounts.spotify.com/authorize?${query.toString()}`);
});

app.get("/auth/callback", (req, res) => {
  const code = req.query.code || null;
  const authOptions = {
    url: "https://accounts.spotify.com/api/token",
    form: {
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    },
    headers: {
      Authorization: "Basic " + Buffer.from(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    json: true,
  };
  request.post(authOptions, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      latest_token = body.access_token;
      latest_refresh_token = body.refresh_token;
      console.log("callback access_token:", body.access_token);
      console.log("callback refresh_token:", body.refresh_token);
      if (!latest_refresh_token) {
        console.warn("No refresh token received! Forcing user to re-consent.");
        return res.redirect("/auth/login");
      }
      res.redirect(`http://localhost:5173/#access_token=${latest_token}`);
    } else {
      console.error("Token exchange failed:", body);
      res.redirect("/error");
    }
  });
});

function refreshAccessToken() {
  return new Promise((resolve, reject) => {
    if (!latest_refresh_token) {
      console.error("No refresh token available—cannot refresh access token!");
      return reject(new Error("No refresh token available"));
    }
    const authOptions = {
      url: "https://accounts.spotify.com/api/token",
      form: {
        grant_type: "refresh_token",
        refresh_token: latest_refresh_token,
      },
      headers: {
        Authorization: "Basic " + Buffer.from(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      json: true,
    };
    request.post(authOptions, (error, response, body) => {
      if (!error && response.statusCode === 200 && body.access_token) {
        latest_token = body.access_token;
        if (body.refresh_token) {
          latest_refresh_token = body.refresh_token;
        }
        console.log("Refreshed access_token:", body.access_token);
        if (body.refresh_token) {
          console.log("Updated refresh_token:", body.refresh_token);
        }
        resolve();
      } else {
        console.error("Failed to refresh access token. Details:", body);
        reject(new Error("Failed to refresh access token"));
      }
    });
  });
}

app.get("/api/playlist/:playlistId", async (req, res) => {
  const playlistId = req.params.playlistId;
  const now = Date.now();
  const count = Number(req.query.count) || 3;   

  const cacheEntry = playlistCache[playlistId];
  if (cacheEntry && now < cacheEntry.expiresAt) {
    // requested count for cache
    return res.json({ tracks: pickRandomTracks(cacheEntry.tracks, count) });
  }

  async function fetchFromSpotifyApi(token) {
    const allTracks = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      let response;
      try {
        response = await axios.get(
          `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (err) {
        throw err;
      }
      const items = response.data.items;
      if (!items || !items.length) break;
      allTracks.push(...items);
      offset += limit;
    }
    playlistCache[playlistId] = {
      tracks: allTracks,
      expiresAt: now + CACHE_TTL_MS,
    };
    return allTracks;
  }

  try {
    const tracks = await fetchFromSpotifyApi(latest_token);
    // use requested count if fresh (not just 3)
    res.json({ tracks: pickRandomTracks(tracks, count) });
  } catch (err) {
    if (err.response && err.response.status === 401) {
      try {
        await refreshAccessToken();
        const tracks = await fetchFromSpotifyApi(latest_token);
        // usinge requested count also here
        res.json({ tracks: pickRandomTracks(tracks, count) });
      } catch (refreshErr) {
        console.error("Failed to refresh token and fetch playlist:", refreshErr.message);
        return res.status(500).json({ error: "Unable to refresh token" });
      }
    } else {
      console.error("Failed to fetch playlist:", err?.message || err);
      res.status(500).json({ error: "Failed to fetch playlist" });
    }
  }
});


function pickRandomTracks(tracks, count = 3) {
  const shuffled = [...tracks].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}
