// doo-wops radio: an iPod on the home page, after andisarchive.neocities.org.
// Songs come from one YouTube playlist, read through our backend (YouTube's
// embed player can't open this old-style short playlist ID itself), and play
// through YouTube's player API. The player sits under the album art, so the
// screen only shows the art, song and artist.
//
// The player is built as the page loads, cued to the song on screen, so
// pressing play starts that song straight from the click. (Building it after
// the click, then playing once it loaded, let browsers block the sound.)
// The screen always shows what the player actually has loaded.
//
// Wheel: MENU = new shuffle, |<< / >>| = previous / next, centre = play/pause.

import { BACKEND_URL, esc } from "./util.js";

var PLAYLIST = "PLX1Yr2hJ1rqI";
var MIX_SIZE = 20;

var player = null;
var ready = false;
var wantPlay = false; // play was pressed before the player finished loading
var byId = {}; // this shuffle's songs, by video id

export function initIpod() {
  var box = document.getElementById("ipod");
  if (!box) return;
  box.addEventListener("click", onWheel);
  build();
}

function onWheel(e) {
  var btn = e.target.closest("[data-ipod]");
  if (!btn) return;
  var what = btn.dataset.ipod;
  if (!ready) {
    // still loading: remember a press of play and start as soon as it's ready
    if (what === "play") {
      wantPlay = true;
      setLoading(true);
    }
    return;
  }
  if (what === "menu") reshuffle();
  else if (what === "prev") player.previousVideo();
  else if (what === "next") player.nextVideo();
  else if (what === "play") {
    if (player.getPlayerState() === 1) player.pauseVideo();
    else player.playVideo();
  }
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

// Load the song list and YouTube's player script side by side, then build a
// player cued (not playing) to the first song.
async function build() {
  var api = new Promise(function (resolve) {
    window.onYouTubeIframeAPIReady = resolve;
    var s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  var ids;
  try {
    ids = await loadMix();
  } catch {
    ids = [];
  }
  if (!ids.length) {
    setMeta("radio is off air", "try again later");
    return;
  }
  showSong(ids[0], "press play");
  await api;
  player = new window.YT.Player("ipod-player", {
    // YouTube refuses to play in players under 200x200; the screen crops it
    width: 200,
    height: 200,
    videoId: ids[0],
    playerVars: { playlist: ids.slice(1).join(","), controls: 0, rel: 0, playsinline: 1, autoplay: 0 },
    events: {
      onReady: function () {
        ready = true;
        if (wantPlay) player.playVideo();
      },
      onStateChange: update,
      // 100 removed, 101/150 the owner blocks embedding: skip it
      onError: function () { player.nextVideo(); },
    },
  });
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
  if (d && d.video_id) showSong(d.video_id, st === 1 || st === 2 || st === 3 ? null : "press play", d);
}

// Album art, song and artist on the iPod screen. `note` replaces the artist
// line (e.g. "press play"); `d` is the player's own video data, if any.
function showSong(id, note, d) {
  var art = document.getElementById("ipod-art");
  art.src = "https://i.ytimg.com/vi/" + encodeURIComponent(id) + "/hqdefault.jpg";
  art.hidden = false;
  var t = byId[id];
  var parts = splitTitle((t && t.name) || (d && d.title) || "", (t && t.artists[0] && t.artists[0].name) || (d && d.author) || "");
  setMeta(parts.song, note || parts.artist);
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
