// doo-wops radio: an iPod at the bottom of the home page, after
// andisarchive.neocities.org. Songs come from one YouTube playlist, read
// through our backend (YouTube's embed player can't open this old-style short
// playlist ID itself), and play through YouTube's player API. The player sits
// under the album art, so the iPod screen only shows the art, song and artist.
// Wheel: MENU = new shuffle, |<< / >>| = previous / next, centre = play/pause.

import { BACKEND_URL, esc } from "./util.js";

var PLAYLIST = "PLX1Yr2hJ1rqI";
var MIX_SIZE = 20;

var player = null;
var apiLoading = false;
var firstMix = null; // fetched on page load so the first press is quick
var byId = {}; // this shuffle's songs, by video id

export function initIpod() {
  var box = document.getElementById("ipod");
  if (!box) return;
  firstMix = loadMix().catch(function () { return []; });
  box.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-ipod]");
    if (!btn) return;
    if (!player) return start();
    var what = btn.dataset.ipod;
    if (what === "menu") reshuffle();
    else if (what === "prev") player.previousVideo();
    else if (what === "next") player.nextVideo();
    else if (what === "play") {
      if (player.getPlayerState() === 1) player.pauseVideo();
      else player.playVideo();
    }
  });
}

async function loadMix() {
  var res = await fetch(BACKEND_URL + "/api/youtube-playlist/" + PLAYLIST + "?count=" + MIX_SIZE);
  if (!res.ok) throw new Error("playlist");
  var data = await res.json();
  var tracks = data.tracks || [];
  byId = {};
  tracks.forEach(function (t) { byId[t.youtube_video_id] = t; });
  return tracks.map(function (t) { return t.youtube_video_id; });
}

// Everything loads on the first press, so the home page stays light.
async function start() {
  if (apiLoading) return;
  apiLoading = true;
  setLoading(true);
  var ids = await firstMix;
  if (!ids.length) {
    try {
      ids = await loadMix();
    } catch {
      ids = [];
    }
  }
  if (!ids.length) {
    apiLoading = false;
    setLoading(false);
    setMeta("radio is off air", "try again in a minute");
    return;
  }
  window.onYouTubeIframeAPIReady = function () {
    player = new window.YT.Player("ipod-player", {
      // YouTube refuses to play in players under 200x200; the screen crops it
      width: 200,
      height: 200,
      videoId: ids[0],
      playerVars: { playlist: ids.slice(1).join(","), controls: 0, rel: 0, playsinline: 1, autoplay: 1 },
      events: {
        onReady: function () {
          player.playVideo();
          update({ data: player.getPlayerState() });
        },
        onStateChange: update,
        // 100 removed, 101/150 the owner blocks embedding: skip it
        onError: function () { player.nextVideo(); },
      },
    });
  };
  var s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(s);
}

async function reshuffle() {
  setLoading(true);
  try {
    var ids = await loadMix();
    if (ids.length) player.loadPlaylist(ids);
  } catch {
    setLoading(false);
  }
}

function update(e) {
  var st = e.data; // 1 playing, 2 paused, 3 buffering, 5 cued, -1 unstarted
  document.getElementById("ipod").classList.toggle("is-playing", st === 1);
  setLoading(st === 3);
  var d = player.getVideoData ? player.getVideoData() : null;
  var id = d && d.video_id;
  if (!id) return;
  var art = document.getElementById("ipod-art");
  art.src = "https://i.ytimg.com/vi/" + encodeURIComponent(id) + "/hqdefault.jpg";
  art.hidden = false;
  var t = byId[id];
  var parts = splitTitle((t && t.name) || d.title || "", (t && t.artists[0] && t.artists[0].name) || d.author || "");
  // browsers can hold back sound until a click: say so instead of looking stuck
  var waiting = st === -1 || st === 5;
  setMeta(parts.song, waiting ? "press play" : parts.artist);
}

// "Akon - Right Now (Na Na Na) (Official Video)" -> song + artist
function splitTitle(title, author) {
  var t = title.replace(/\s*[([](official|music|lyric|audio|video|hd|4k)[^)\]]*[)\]]/gi, "").trim();
  var dash = t.indexOf(" - ");
  if (dash > 0) return { artist: t.slice(0, dash), song: t.slice(dash + 3) };
  return { artist: author.replace(/ - Topic$/, ""), song: t };
}

function setMeta(song, artist) {
  document.getElementById("ipod-meta").innerHTML =
    '<div class="ipod-song">' + esc(song) + '</div><div class="ipod-artist">' + esc(artist) + "</div>";
}

function setLoading(on) {
  document.getElementById("ipod-spin").hidden = !on;
}
