// The Create A Room and Join A Room forms on the setup screen.

import {
  PLAYLISTS, postJson, playlistPickerHtml, wirePlaylistPicker, readPlaylistPicker, loadName, saveName,
} from "./util.js";
import { enterRoom, setError } from "./screens.js";

// while a form is sending: the loader in place of the button label
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

export function initForms() {
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

  // fill in the name used last time
  var savedName = loadName();
  createForm.name.value = savedName;
  joinForm.name.value = savedName;
}
