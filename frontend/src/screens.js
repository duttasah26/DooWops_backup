// Screens and navigation: home, room setup, the room itself and the
// work-in-progress page share one static page; only one is shown at a time.
// The address bar carries ?room=CODE so invite links and refreshes work.

import { setTitle, saveToken } from "./util.js";
import { openRoom } from "./room.js";

var screens = ["home", "setup", "room", "wip"];

export function show(name) {
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

export function goHome() {
  setRoomInUrl(null);
  show("home");
}

export function goSetup(code, message) {
  show("setup");
  var join = document.getElementById("join-form");
  if (code) join.code.value = code;
  setError("join-error", message || "");
  (code ? join.name : document.getElementById("create-form").name).focus();
}

export function enterRoom(code, token) {
  saveToken(code, token);
  setRoomInUrl(code);
  show("room");
  document.getElementById("tab-room").textContent = "Room " + code;
  openRoom(code, token, {
    onExit: goHome,
    onRejoin: function (c) { goSetup(c); },
  });
}

export function setError(id, text) {
  var el = document.getElementById(id);
  el.textContent = text;
  el.hidden = !text;
}

// Pages that aren't built yet (Credits, Contact, ...) all land here.
export function goWip(page) {
  setRoomInUrl(null);
  show("wip");
  document.getElementById("wip-title").textContent = page;
  setTitle(page);
}

// Links and buttons with data-go="home|setup|wip" switch screens.
export function initScreens() {
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-go]");
    if (!el) return;
    e.preventDefault();
    if (el.dataset.go === "home") goHome();
    else if (el.dataset.go === "setup") goSetup();
    else if (el.dataset.go === "wip") goWip(el.dataset.page || "Coming Soon");
  });
}
