// Shared bits: server addresses, the station list, and small helpers.

export var BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "http://localhost:5000").replace(/\/$/, "");
export var WS_URL = BACKEND_URL.replace(/^http/, "ws");

// Preset playlists. The first one is the default everywhere.
export var PLAYLISTS = [
  { id: "PLRQOvzGsQlU-cwJQeuaze-1al0_ESZDbT", name: "9X FM" },
  { id: "PLRQOvzGsQlU8yJkFOEjvcaH4XtkAVZ8ZO", name: "100.2 Sangeet Bangla FM" },
  { id: "PLRQOvzGsQlU81y8I5LepPVjmfLxYS1AIL", name: "106.2 AMAR FM" },
];

// Escape text before it goes into innerHTML. Names and song titles come from
// other people, so everything user-supplied passes through here.
export function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Accepts a playlist URL (youtube.com/playlist?list=..., youtu.be links with
// &list=...) or a bare ID.
export function playlistIdFrom(text) {
  var v = (text || "").trim();
  try {
    var list = new URL(v).searchParams.get("list");
    if (list) return list;
  } catch {
    // not a URL: treat it as an ID
  }
  return v;
}

// Tab title, old-site style: "doo-wops! | Create Or Join A Room".
export function setTitle(text) {
  var page = String(text || "").replace(/(^|[\s(])(\S)/g, function (m, sp, ch) { return sp + ch.toUpperCase(); });
  document.title = page ? "doo-wops! | " + page : "doo-wops!";
}

export async function postJson(path, body) {
  var res;
  try {
    res = await fetch(BACKEND_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Network failure, or the server refused this site (CORS). The browser
    // doesn't say which, so cover both.
    throw new Error("Couldn't reach the game server. It may be waking up, so try again in a minute.");
  }
  var data = await res.json().catch(function () { return {}; });
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong. Check the form and try again.");
  }
  return data;
}

// The playlist picker: one radio per preset, plus "custom" with a URL box.
// Used on the create-room form and in the host's room settings.
export function playlistPickerHtml(name, currentId) {
  var preset = PLAYLISTS.some(function (p) { return p.id === currentId; });
  var rows = PLAYLISTS.map(function (p) {
    return (
      '<label class="pick-row"><input type="radio" name="' + name + '" value="' + p.id + '"' +
      (p.id === currentId ? " checked" : "") + "> " + esc(p.name) + "</label>"
    );
  }).join("");
  var custom = !preset && currentId;
  return (
    rows +
    '<label class="pick-row"><input type="radio" name="' + name + '" value="custom"' + (custom ? " checked" : "") +
    "> custom playlist</label>" +
    '<div class="pick-custom"' + (custom ? "" : " hidden") + '>' +
    '<input class="txt wide" name="' + name + '-url" placeholder="paste a YouTube playlist link" value="' +
    (custom ? esc(currentId) : "") + '">' +
    "</div>"
  );
}

// Show/hide the custom URL box when the radio changes. Call once per form.
export function wirePlaylistPicker(form, name) {
  form.addEventListener("change", function (e) {
    if (e.target.name !== name) return;
    var box = form.querySelector(".pick-custom");
    box.hidden = e.target.value !== "custom";
    if (!box.hidden) box.querySelector("input").focus();
  });
}

// { id, name } from a picker, or null when "custom" has no usable link.
export function readPlaylistPicker(form, name) {
  var checked = form.querySelector('input[name="' + name + '"]:checked');
  if (!checked) return null;
  if (checked.value !== "custom") {
    var p = PLAYLISTS.find(function (x) { return x.id === checked.value; });
    return { id: p.id, name: p.name };
  }
  var id = playlistIdFrom(form.querySelector('input[name="' + name + '-url"]').value);
  return id ? { id: id, name: "custom playlist" } : null;
}

// Seat tokens live in sessionStorage so a refresh rejoins the same seat while
// two tabs on one machine can still be two different people.
export function loadToken(code) {
  try { return sessionStorage.getItem("doowops_room_" + code); } catch { return null; }
}
export function saveToken(code, token) {
  try { sessionStorage.setItem("doowops_room_" + code, token); } catch { /* refresh just won't rejoin */ }
}
export function clearToken(code) {
  try { sessionStorage.removeItem("doowops_room_" + code); } catch { /* nothing to clear */ }
}

// Remember the last name typed, for convenience.
export function loadName() {
  try { return localStorage.getItem("doowops_name") || ""; } catch { return ""; }
}
export function saveName(name) {
  try { localStorage.setItem("doowops_name", name); } catch { /* optional */ }
}
