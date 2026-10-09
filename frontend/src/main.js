// Page wiring: three screens (home, room setup, room) in one static page.
// The address bar carries ?room=CODE so invite links and refreshes work.

import "./style.css";
import {
  PLAYLISTS, setTitle, postJson, playlistPickerHtml, wirePlaylistPicker, readPlaylistPicker,
  loadToken, saveToken, loadName, saveName,
} from "./util.js";
import { openRoom } from "./room.js";
import { initIpod } from "./ipod.js";

var screens = ["home", "setup", "room", "wip"];

function show(name) {
  screens.forEach(function (s) {
    document.getElementById("screen-" + s).hidden = s !== name;
  });
  document.body.classList.remove("in-game");
  setTab(name);
  if (name === "home") setTitle("home");
  if (name === "setup") setTitle("create or join a room");
  window.scrollTo(0, 0);
}

// Winamp-style tab bar: the tab for the current screen is the white one.
function setTab(name) {
  document.querySelectorAll("#tabs [data-tab]").forEach(function (t) {
    t.classList.toggle("on", t.dataset.tab === name);
  });
  document.getElementById("tab-room").hidden = name !== "room";
  if (name !== "room") document.getElementById("tab-status").textContent = "";
}

function setRoomInUrl(code) {
  var url = new URL(location.href);
  if (code) url.searchParams.set("room", code);
  else url.searchParams.delete("room");
  history.replaceState(null, "", url);
}

function goHome() {
  setRoomInUrl(null);
  show("home");
}

function goSetup(code, message) {
  show("setup");
  var join = document.getElementById("join-form");
  if (code) join.code.value = code;
  setError("join-error", message || "");
  (code ? join.name : document.getElementById("create-form").name).focus();
}

function enterRoom(code, token) {
  saveToken(code, token);
  setRoomInUrl(code);
  show("room");
  document.getElementById("tab-room").textContent = "Room " + code;
  openRoom(code, token, {
    onExit: goHome,
    onRejoin: function (c) { goSetup(c); },
  });
}

function setError(id, text) {
  var el = document.getElementById(id);
  el.textContent = text;
  el.hidden = !text;
}

function busy(form, on) {
  var btn = form.querySelector("button[type=submit]");
  if (on) {
    btn.dataset.label = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span>';
  } else if (btn.dataset.label) {
    btn.textContent = btn.dataset.label;
  }
  btn.disabled = on;
}

// ── create a room ──────────────────────────────────────────────────────────

var createForm = document.getElementById("create-form");
document.getElementById("create-playlist").innerHTML = playlistPickerHtml("create-pl", PLAYLISTS[0].id);
wirePlaylistPicker(createForm, "create-pl");

createForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  var name = createForm.name.value.trim();
  var pl = readPlaylistPicker(createForm, "create-pl");
  if (!name) return setError("create-error", "Enter your name.");
  if (!pl) return setError("create-error", "Paste a YouTube playlist link for the custom playlist.");
  setError("create-error", "");
  saveName(name);
  busy(createForm, true);
  try {
    var data = await postJson("/api/rooms", {
      name: name,
      playlist_id: pl.id,
      playlist_name: pl.name,
      num_rounds: Number(createForm.rounds.value),
    });
    enterRoom(data.code, data.token);
  } catch (err) {
    setError("create-error", err.message);
  } finally {
    busy(createForm, false);
  }
});

// ── join a room ────────────────────────────────────────────────────────────

var joinForm = document.getElementById("join-form");
joinForm.addEventListener("submit", async function (e) {
  e.preventDefault();
  var name = joinForm.name.value.trim();
  var code = joinForm.code.value.trim().toUpperCase();
  if (!name || code.length < 4) return setError("join-error", "Enter your name and the room code.");
  setError("join-error", "");
  saveName(name);
  busy(joinForm, true);
  try {
    var data = await postJson("/api/rooms/" + encodeURIComponent(code) + "/join", { name: name });
    enterRoom(data.code, data.token);
  } catch (err) {
    setError("join-error", err.message);
  } finally {
    busy(joinForm, false);
  }
});

// ── links and buttons that switch screens ──────────────────────────────────

document.addEventListener("click", function (e) {
  var el = e.target.closest("[data-go]");
  if (!el) return;
  e.preventDefault();
  if (el.dataset.go === "home") goHome();
  else if (el.dataset.go === "setup") goSetup();
  else if (el.dataset.go === "wip") goWip(el.dataset.page || "Coming Soon");
});

// Pages that aren't built yet (Credits, Contact, ...) all land here.
function goWip(page) {
  setRoomInUrl(null);
  show("wip");
  document.getElementById("wip-title").textContent = page;
  setTitle(page.toLowerCase() + ", coming soon");
}

// ── start ──────────────────────────────────────────────────────────────────

var savedName = loadName();
createForm.name.value = savedName;
joinForm.name.value = savedName;

document.getElementById("date").textContent = new Date().toLocaleDateString("en-US", {
  month: "short", day: "numeric", year: "numeric",
});

// Marquee strips of the little button gifs between sections. The row is
// written twice and scrolled by CSS, so a strip is full from the first frame
// (a <marquee> starts empty) and loops without a gap. It never pauses.
var BUTTON_GIFS = [
  "4music.gif", "brat.gif", "538-turnmeon.gif", "freely2.gif", "daft-punk.gif", "grillz.gif",
  "itv3.gif", "hardcore-tanoc.gif", "kiss.gif", "music.gif", "london2012.gif", "plastic.gif",
  "more4.gif", "three-question-button2.gif", "nokia.gif", "triples4.gif", "nrkp3.gif", "viva-happy.gif",
  "pool.gif", "wow-wow.gif", "radio-activity.gif", "y2k.gif", "techno.gif", "vevo.gif", "y2k4.gif",
];
document.querySelectorAll(".gifstrip").forEach(function (strip, i) {
  // start each strip at a different gif so they don't line up
  var start = (i * 7) % BUTTON_GIFS.length;
  var shifted = BUTTON_GIFS.slice(start).concat(BUTTON_GIFS.slice(0, start));
  var html = shifted.map(function (g) { return '<img src="/buttons/' + g + '" alt="">'; }).join("");
  strip.innerHTML = '<div class="gifstrip-track">' + html + html + "</div>";
});

// Chatbox: Chattable, plus a name box. Chattable's setName() pops up a
// confirm box to stop sites renaming people behind their back; here the
// person types the name and presses "set" themselves, so we send the same
// setName message straight to the chat frame instead.
if (window.chattable) window.chattable.initialize();
var chatName = document.getElementById("chat-name");
chatName.handle.value = savedName;
chatName.addEventListener("submit", function (e) {
  e.preventDefault();
  var handle = chatName.handle.value.trim();
  if (!handle || !window.chattable) return;
  saveName(handle);
  window.chattable.sendMessageToFrame({ type: "setName", value: handle });
  window.chattable.user.name = handle;
});

// "Get Started" row: a photo above each column, like MySpace's "Cool New
// Videos". The photos in /sections are shuffled into the columns each visit.
var SECTION_PHOTOS = [
  "preity.jpg", "834dd3563c098f12d61ec9b299dfe8c6.jpg",
  "ad54690a380c8c4d9687fd636e5b18e9.jpg", "bbc643660ffae58577a0f2ea30572993.jpg",
];
var photos = SECTION_PHOTOS.slice();
for (var k = photos.length - 1; k > 0; k--) {
  var r = Math.floor(Math.random() * (k + 1));
  var tmp = photos[k]; photos[k] = photos[r]; photos[r] = tmp;
}
document.querySelectorAll(".gs-photo").forEach(function (img, i) {
  img.src = "/sections/" + photos[i % photos.length];
});

initIpod();

var roomCode = (new URL(location.href).searchParams.get("room") || "").toUpperCase();
var roomToken = roomCode && loadToken(roomCode);
if (roomToken) enterRoom(roomCode, roomToken);
else if (roomCode) goSetup(roomCode);
else show("home");
