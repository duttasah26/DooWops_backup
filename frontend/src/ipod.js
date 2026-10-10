// doo-wops Radio: an iPod on the home page, built from the theme in /RADIO
// (ui_1-3.png are the reference). Songs come from YouTube playlists read
// through our backend (YouTube's embed player can't open these short playlist
// ids itself) and play through YouTube's player API. The player sits inside
// the screen, hidden under the cover art, or full screen in Videos.
//
// Screens, like a real iPod: Home (menu + big icon), Now Playing, Music (this
// mix's songs), Videos, FM Radio (tunes in), Settings (Shutdown, Timed
// shutdown, Shuffle, Repeat, Equalizer, Backlight, Brightness, Key tone).
// Menus slide in from the right and back out on MENU.
//
// Click wheel: drag round it (or mouse wheel / arrow keys) to scroll menus;
// on Now Playing it changes the volume, or seeks after pressing the centre.
// Tap the top/left/right/bottom of the ring for MENU, previous, next,
// play/pause; the centre selects. Each step ticks (Settings > Key tone).
//
// The player is built as the page loads, cued to the first song, so pressing
// play starts it straight from the click (building it after the click let
// browsers block the sound).

import { BACKEND_URL, esc } from "./util.js";

// one playlist for now (station picking was tried and taken out)
var STATION = { id: "PLX1Yr2hJ1rqI", name: "doo-wops Radio" };
var MIX_SIZE = 20;
var ROW_H = 45; // menu row height on the 480x360 screen
var ROWS = 7; // rows that fit under the status bar
var STEP_DEG = 18; // how far round the wheel one scroll step is

// ── state ──────────────────────────────────────────────────────────────────

var lcd, viewsEl;
var stack = []; // open screens, Home first
var player = null;
var ready = false;
var wantPlay = false; // play pressed before the player had loaded
var started = false; // anything played yet (shows the play/pause status icon)
var offAir = false; // the playlist failed to load
var shownId = null; // the song on screen: only changes once a song really starts
var bad = {}; // songs YouTube won't play here (embedding blocked / removed)
var dir = 1; // which way we're skipping, so a bad song is skipped the same way
var off = false; // shut down (Settings > Shutdown): any button boots it up
var sleep = "off"; // Timed shutdown, in minutes (not saved: like a sleep timer)
var sleepTimer = null;
var dialog = null; // the open confirm box, if any
var endedId = null; // the song Shuffle last jumped away from at its end
var mix = []; // this shuffle's tracks, in player order
var byId = {};
var volTimer = null;
var dimTimer = null;
var audio = null;

var settings = { shuffle: false, repeat: "off", eq: "normal", backlight: "30", brightness: 5, clicker: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem("dw-ipod") || "{}")); } catch { /* defaults */ }
function saveSettings() {
  try { localStorage.setItem("dw-ipod", JSON.stringify(settings)); } catch { /* private mode */ }
}

export function initIpod() {
  lcd = document.getElementById("ipod-lcd");
  if (!lcd) return;
  viewsEl = document.getElementById("ipod-views");
  fitScreen();
  wireWheel();
  watchBattery();
  applySettings();
  // Home underneath, Now Playing on top: MENU goes back to Home
  push(homeScreen(), true);
  push(nowScreen(), true);
  wake();
  build();
  setInterval(tick, 500);
}

// the screen is drawn at 480x360; scale it to whatever the bezel is
function fitScreen() {
  var fit = document.getElementById("ipod-fit");
  var set = function () { lcd.style.setProperty("--s", fit.clientWidth / 480); };
  set();
  new ResizeObserver(set).observe(fit);
}

// ── player ─────────────────────────────────────────────────────────────────

// the playlist's songs from our backend (a fresh shuffle each fetch)
async function fetchMix() {
  var res = await fetch(BACKEND_URL + "/api/youtube-playlist/" + STATION.id + "?count=" + MIX_SIZE);
  if (!res.ok) throw new Error("playlist");
  var data = await res.json();
  return data.tracks || [];
}

async function loadMix() {
  mix = await fetchMix();
  byId = {};
  mix.forEach(function (t) { byId[t.youtube_video_id] = t; });
  refresh();
  return mix.map(function (t) { return t.youtube_video_id; });
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
  try { ids = await loadMix(); } catch { ids = []; }
  if (!ids.length) {
    offAir = true;
    return refresh();
  }
  await api;
  player = new window.YT.Player("ipod-player", {
    // YouTube refuses to play in players under 200x200; the cover art hides it
    width: 200,
    height: 200,
    videoId: ids[0],
    playerVars: { playlist: ids.slice(1).join(","), controls: 0, rel: 0, playsinline: 1, autoplay: 0 },
    events: {
      onReady: function () {
        ready = true;
        applySettings();
        if (wantPlay) player.playVideo();
        refresh();
      },
      onStateChange: function (e) {
        setLoading(e.data === 3);
        // playing, paused or cued: this song is really the one loaded, so
        // show it (while switching, the screen keeps the last good song)
        if (e.data === 1 || e.data === 2 || e.data === 5) {
          var d = player.getVideoData();
          if (d && d.video_id && !bad[d.video_id]) shownId = d.video_id;
        }
        if (e.data === 1) {
          started = true;
          dir = 1;
        }
        refresh();
      },
      // 100 removed, 101/150 the owner blocks embedding: remember it and skip
      // on in the same direction, without ever showing it
      onError: function () {
        var d = player.getVideoData();
        if (d && d.video_id) bad[d.video_id] = true;
        setLoading(true);
        step(dir);
      },
    },
  });
}

function isPlaying() { return ready && player.getPlayerState() === 1; }

function playPause() {
  if (!ready) {
    wantPlay = true;
    setLoading(true);
    return;
  }
  if (isPlaying()) player.pauseVideo();
  else player.playVideo();
}

function prevSong() {
  if (!ready) return;
  // like an iPod: back to the start of the song first, then the one before
  if (player.getCurrentTime() > 3) player.seekTo(0, true);
  else step(-1);
}

function nextSong() { if (ready) step(1); }

// play the next (d = 1) or previous (d = -1) song that isn't a known bad one;
// with Shuffle on, "next" is any other playable song
function step(d) {
  dir = d;
  var ids = playlistIds();
  var n = ids.length;
  var i = player.getPlaylistIndex();
  if (settings.shuffle && d === 1) {
    var pick = ids.map(function (id, k) { return k; }).filter(function (k) { return k !== i && !bad[ids[k]]; });
    if (pick.length) return player.playVideoAt(pick[Math.floor(Math.random() * pick.length)]);
  }
  for (var k = 1; k <= n; k++) {
    var j = (((i + d * k) % n) + n) % n;
    if (!bad[ids[j]]) return player.playVideoAt(j);
  }
}

// the video ids in the player's playlist (YouTube's own order once shuffled)
function playlistIds() {
  var ids = ready && player.getPlaylist ? player.getPlaylist() : null;
  return ids && ids.length ? ids : mix.map(function (t) { return t.youtube_video_id; });
}

// the song on screen (the last one that really started), and its place
// among the playable songs
function current() {
  var good = playlistIds().filter(function (id) { return !bad[id]; });
  var id = shownId || good[0];
  if (!id) return null;
  var d = ready && player.getVideoData ? player.getVideoData() : null;
  if (d && d.video_id !== id) d = null; // the player's info is about another song
  var t = byId[id];
  var parts = splitTitle((t && t.name) || (d && d.title) || "", (t && t.artists[0] && t.artists[0].name) || (d && d.author) || "");
  return { id: id, song: parts.song, artist: parts.artist, n: Math.max(good.indexOf(id), 0) + 1, of: good.length };
}

// "Akon - Right Now (Na Na Na) (Official Video)" -> song + artist
function splitTitle(title, author) {
  var t = title.replace(/\s*[([](official|music|lyric|audio|video|hd|4k)[^)\]]*[)\]]/gi, "").trim();
  var dash = t.indexOf(" - ");
  if (dash > 0) return { artist: t.slice(0, dash), song: t.slice(dash + 3) };
  return { artist: author.replace(/ - Topic$/, ""), song: t };
}

function setLoading(on) {
  document.getElementById("ipod-spin").hidden = !on;
}

// ── screens ────────────────────────────────────────────────────────────────
// A screen is { title, cls, render(el), update(), rotate(dir), select() }.
// Menus share listScreen(); Now Playing and Videos are their own.

function listScreen(title, cls, getItems, extra) {
  var scr = {
    title: title, cls: cls, sel: 0, top: 0,
    items: getItems,
    render: function (el) {
      el.innerHTML = '<div class="list"><div class="list-inner"></div></div>' + (extra ? extra.html : "");
      scr.fill(el);
    },
    fill: function (el) {
      var items = getItems();
      scr.sel = Math.min(scr.sel, Math.max(items.length - 1, 0));
      el.querySelector(".list-inner").innerHTML = items.map(function (it) {
        return '<div class="row' + (it.more ? " more" : "") + (it.off ? " off" : "") + '">' + esc(it.label) +
          (it.val != null ? '<span class="val">' + esc(it.val) + "</span>" : "") +
          "</div>";
      }).join("");
      scr.update(el, true);
    },
    update: function (el, force) {
      var rows = el.querySelectorAll(".row");
      rows.forEach(function (r, i) { r.classList.toggle("sel", i === scr.sel); });
      if (scr.sel < scr.top) scr.top = scr.sel;
      if (scr.sel >= scr.top + ROWS) scr.top = scr.sel - ROWS + 1;
      el.querySelector(".list-inner").style.transform = "translateY(" + (-scr.top * ROW_H) + "px)";
      if (extra) extra.update(el, getItems()[scr.sel], force);
    },
    rotate: function (dir) {
      var n = getItems().length;
      var next = Math.max(0, Math.min(n - 1, scr.sel + dir));
      if (next === scr.sel) return false;
      scr.sel = next;
      scr.update(scr.el);
      return true;
    },
    select: function () {
      var it = getItems()[scr.sel];
      if (it && it.go) it.go();
    },
  };
  return scr;
}

function homeScreen() {
  var items = [
    { label: "Now playing", icon: "home-now", more: true, go: function () { push(nowScreen()); } },
    { label: "Music", icon: "home-music", more: true, go: function () { push(musicScreen()); } },
    { label: "Videos", icon: "home-videos", more: true, go: function () { push(videoScreen()); } },
    // one playlist for now: FM Radio just tunes in (plays it) and shows it
    { label: "FM Radio", icon: "home-radio", more: true, go: function () { if (!isPlaying()) playPause(); push(nowScreen()); } },
    { label: "Settings", icon: "home-settings", more: true, go: function () { push(settingsScreen()); } },
  ];
  var shown = "";
  return listScreen("Home", "v-home", function () { return items; }, {
    html: '<div class="preview"></div>',
    update: function (el, it) {
      if (!it || it.icon === shown) return;
      shown = it.icon;
      el.querySelector(".preview").innerHTML = '<img src="/ipod/' + it.icon + '.png" alt="">';
    },
  });
}

function musicScreen() {
  return listScreen("Music", "v-list", function () {
    var ids = playlistIds();
    if (!ids.length) return [{ label: "Loading songs...", off: true }];
    var items = [];
    ids.forEach(function (id, i) {
      if (bad[id]) return; // songs that won't play here aren't listed
      var t = byId[id];
      var label = t ? splitTitle(t.name, (t.artists[0] && t.artists[0].name) || "").song : "Song " + (items.length + 1);
      items.push({ label: label, go: function () { if (ready) { dir = 1; player.playVideoAt(i); push(nowScreen()); } } });
    });
    return items;
  });
}

var REPEAT = ["off", "all", "one"];
var BACKLIGHT = ["always", "10", "30", "60"];
var SLEEP = ["off", "10", "20", "30", "60", "90", "120"];
// the theme's equalizer presets. Only the setting and its icon change: the
// sound comes from YouTube's player in its own frame, which the page can't EQ.
var EQ = [["normal", "Normal"], ["classical", "Classical"], ["dance", "Dance"], ["flat", "Flat"], ["folk", "Folk"],
  ["metal", "Heavy metal"], ["hiphop", "Hip hop"], ["jazz", "Jazz"], ["pop", "Pop"], ["rock", "Rock"]];
var EQ_KEYS = EQ.map(function (e) { return e[0]; });

// Settings, as in the theme's reference (ui_3.png). File extensions and Key
// lock are left out: there are no files, and a lock would lock the wheel
// needed to unlock it.
function settingsScreen() {
  var onOff = function (v) { return v ? "On" : "Off"; };
  var scr = listScreen("Settings", "v-settings", function () {
    var eq = EQ[EQ_KEYS.indexOf(settings.eq)] || EQ[0];
    return [
      { label: "Shutdown", more: true, icon: "set-shutdown", go: askShutdown },
      { label: "Timed shutdown", val: sleep === "off" ? "Off" : sleep + "m", icon: "set-timer-" + sleep, go: function () { sleep = next(SLEEP, sleep); setSleep(); scr.fill(scr.el); } },
      { label: "Shuffle", val: onOff(settings.shuffle), icon: "set-shuffle-" + (settings.shuffle ? "on" : "off"), go: function () { settings.shuffle = !settings.shuffle; changed(); } },
      { label: "Repeat", val: cap(settings.repeat), icon: "set-repeat-" + settings.repeat, go: function () { settings.repeat = next(REPEAT, settings.repeat); changed(); } },
      { label: "Equalizer", more: true, panel: eq[1], icon: "set-eq-" + eq[0], go: function () { settings.eq = next(EQ_KEYS, settings.eq); changed(); } },
      { label: "Backlight", val: settings.backlight === "always" ? "On" : settings.backlight + "s", icon: "set-backlight-" + settings.backlight, go: function () { settings.backlight = next(BACKLIGHT, settings.backlight); changed(); } },
      { label: "Brightness", val: String(settings.brightness), icon: "set-brightness", go: function () { settings.brightness = settings.brightness % 5 + 1; changed(); } },
      { label: "Key tone", val: onOff(settings.clicker), icon: "set-clicker-" + (settings.clicker ? "on" : "off"), go: function () { settings.clicker = !settings.clicker; changed(); } },
    ];
  }, {
    html: '<div class="set-panel"><div class="set-name"></div></div>',
    update: function (el, it) {
      el.querySelector(".set-name").textContent = it.panel || it.label;
      var img = el.querySelector(".set-panel img");
      if (!img || img.dataset.icon !== it.icon) {
        if (img) img.remove();
        el.querySelector(".set-panel").insertAdjacentHTML("beforeend", '<img data-icon="' + it.icon + '" src="/ipod/' + it.icon + '.png" alt="">');
      }
    },
  });
  function next(list, v) { return list[(list.indexOf(v) + 1) % list.length]; }
  function changed() {
    saveSettings();
    applySettings();
    scr.fill(scr.el);
    wake();
  }
  return scr;
}

// put the settings that touch the player and screen into effect
function applySettings() {
  lcd.style.setProperty("--bright", 0.5 + settings.brightness * 0.1);
  if (!ready) return;
  player.setLoop(settings.repeat === "all");
  // Shuffle is ours (step() and tick()), not YouTube's setShuffle: that
  // reorders the playlist under the song on screen, so play started a
  // different song from the one shown
}

// Timed shutdown: power off after that many minutes
function setSleep() {
  clearTimeout(sleepTimer);
  if (sleep !== "off") sleepTimer = setTimeout(shutdown, Number(sleep) * 60000);
}

// ── shutdown: a confirm box, then the screen goes dark and the music stops ──

function askShutdown() {
  dialog = { sel: 1, el: document.createElement("div") };
  dialog.el.className = "dialog";
  dialog.el.innerHTML = '<div class="dlg-box"><div class="dlg-text">Shut down?</div>' +
    '<div class="dlg-opts"><span class="dlg-opt">Cancel</span><span class="dlg-opt">OK</span></div></div>';
  lcd.appendChild(dialog.el);
  drawDialog();
}

function drawDialog() {
  dialog.el.querySelectorAll(".dlg-opt").forEach(function (o, i) { o.classList.toggle("sel", i === dialog.sel); });
}

function closeDialog(ok) {
  dialog.el.remove();
  dialog = null;
  if (ok) shutdown();
}

function shutdown() {
  if (ready) player.pauseVideo();
  sleep = "off";
  clearTimeout(sleepTimer);
  off = true;
  lcd.classList.add("off");
}

// any button while off: the logo for a moment, then back where it was
function boot() {
  off = false;
  lcd.classList.remove("off");
  lcd.classList.add("boot");
  setTimeout(function () { lcd.classList.remove("boot"); }, 1300);
  wake();
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function nowScreen() {
  var scrub = false;
  var scr = {
    title: "Now Playing", cls: "v-np",
    render: function (el) {
      el.innerHTML =
        '<div class="np-art"><img src="/brand/logo.png" alt=""></div>' +
        '<div class="np-info"><div class="marq np-title"><span></span></div><div class="marq np-artist"><span></span></div>' +
        '<div class="marq np-album"><span></span></div><div class="np-count"></div></div>' +
        '<div class="np-bar"><div class="np-fill"></div></div>' +
        '<div class="np-time"><span class="np-times np-now">0:00</span><span class="np-vol-label">Volume</span><span class="np-times np-left">0:00</span></div>';
      scr.update(el, true);
    },
    update: function (el, force) {
      var c = current();
      var key = c ? c.id + "|" + c.n : "none";
      if (force || key !== scr.shown) {
        scr.shown = key;
        el.querySelector(".np-art img").src = c ? "https://i.ytimg.com/vi/" + encodeURIComponent(c.id) + "/mqdefault.jpg" : "/brand/logo.png";
        setMarq(el.querySelector(".np-title"), c ? c.song : offAir ? "Radio off air" : "Tuning in...");
        setMarq(el.querySelector(".np-artist"), c ? c.artist : offAir ? "try again later" : "");
        setMarq(el.querySelector(".np-album"), STATION.name);
        el.querySelector(".np-count").textContent = c && c.of ? c.n + "/" + c.of : "";
      }
      if (el.classList.contains("vol")) {
        el.querySelector(".np-fill").style.width = (ready ? player.getVolume() : 100) + "%";
        return;
      }
      var t = ready ? player.getCurrentTime() || 0 : 0;
      var d = ready ? player.getDuration() || 0 : 0;
      el.querySelector(".np-fill").style.width = (d ? Math.min(100, (t / d) * 100) : 0) + "%";
      el.querySelector(".np-now").textContent = clock(t);
      el.querySelector(".np-left").textContent = clock(d);
    },
    rotate: function (dir) {
      if (!ready) return false;
      if (scrub) {
        player.seekTo(Math.max(0, player.getCurrentTime() + dir * 5), true);
      } else {
        player.setVolume(Math.max(0, Math.min(100, player.getVolume() + dir * 5)));
        scr.el.classList.add("vol");
        clearTimeout(volTimer);
        volTimer = setTimeout(function () { scr.el.classList.remove("vol"); scr.update(scr.el); }, 1500);
      }
      scr.update(scr.el);
      return true;
    },
    // centre button: switch the wheel between volume and seeking
    select: function () {
      scrub = !scrub;
      scr.el.classList.toggle("scrub", scrub);
      scr.el.classList.remove("vol");
    },
  };
  return scr;
}

// the music video, full screen (the player moves up over the menus)
function videoScreen() {
  var scr = {
    title: "Videos", cls: "v-video",
    render: function () {},
    update: function () {},
    rotate: function (dir) {
      if (!ready) return false;
      player.setVolume(Math.max(0, Math.min(100, player.getVolume() + dir * 5)));
      return true;
    },
    select: playPause,
    // bring the player up only once the slide has finished, and drop it the
    // moment we leave, so it never shows behind other screens
    onShow: function () { setTimeout(function () { if (top() === scr) lcd.classList.add("video"); }, 320); },
    onHide: function () { lcd.classList.remove("video"); },
  };
  return scr;
}

// a line that slides back and forth when it's too long to fit
function setMarq(box, text) {
  var span = box.firstChild;
  span.textContent = text;
  box.classList.remove("scroll");
  var over = span.offsetWidth - box.clientWidth;
  if (over > 0) {
    box.style.setProperty("--d", -over + "px");
    box.classList.add("scroll");
  }
}

function clock(sec) {
  sec = Math.floor(sec || 0);
  var m = Math.floor(sec / 60), s = sec % 60;
  return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
}

// ── navigation: menus slide in from the right, MENU slides them back ──────

function top() { return stack[stack.length - 1]; }

function push(scr, instant) {
  var from = top();
  var el = document.createElement("div");
  el.className = "view " + scr.cls + (instant ? " no-anim" : "");
  scr.el = el;
  scr.render(el);
  if (!instant) el.style.transform = "translateX(100%)";
  viewsEl.appendChild(el);
  stack.push(scr);
  if (from) {
    if (from.onHide) from.onHide();
    from.el.style.transform = "translateX(-100%)";
  }
  el.getBoundingClientRect(); // start the slide from the right
  el.style.transform = "translateX(0)";
  if (instant) {
    // placed without a slide; give it its slide back for later moves, or it
    // jumps away and leaves a gap that shows the YouTube player behind
    el.getBoundingClientRect();
    el.classList.remove("no-anim");
  }
  if (scr.onShow) scr.onShow();
  setTitle();
}

function pop() {
  if (stack.length < 2) return false;
  var leaving = stack.pop();
  if (leaving.onHide) leaving.onHide();
  leaving.el.style.transform = "translateX(100%)";
  setTimeout(function () { leaving.el.remove(); }, 320);
  var back = top();
  back.el.style.transform = "translateX(0)";
  back.update(back.el, true);
  if (back.onShow) back.onShow();
  setTitle();
  return true;
}

function setTitle() { document.getElementById("ipod-title").textContent = top().title; }

// re-draw the open screen after the song list changes
function refresh() {
  var s = top();
  if (!s) return;
  if (s.fill) s.fill(s.el);
  else s.update(s.el, true);
  status();
}

function tick() {
  var s = top();
  if (s && s.cls === "v-np") s.update(s.el);
  // just before a song ends: Repeat One goes back to its start; Shuffle
  // jumps to a random song instead of letting YouTube play the next in line
  if (ready && isPlaying()) {
    var d = player.getDuration(), t = player.getCurrentTime();
    if (d && t > d - 0.6) {
      if (settings.repeat === "one") player.seekTo(0, true);
      else if (settings.shuffle && endedId !== shownId) {
        endedId = shownId; // only once per song
        step(1);
      }
    }
  }
  status();
}

// status bar: play / pause icon once something has played
function status() {
  var img = document.getElementById("ipod-state");
  img.hidden = !started;
  img.src = "/ipod/" + (isPlaying() ? "st-playing" : "st-pause") + ".png";
}

// battery: the real one where the browser tells us, else full
function watchBattery() {
  if (!navigator.getBattery) return;
  navigator.getBattery().then(function (b) {
    var show = function () {
      var step = Math.max(1, Math.ceil(b.level * 4));
      document.getElementById("ipod-bat").src = "/ipod/" + (b.charging ? "batc" : "bat") + step + ".png";
      document.getElementById("ipod-bat-pct").textContent = Math.round(b.level * 100) + "%";
    };
    show();
    b.addEventListener("levelchange", show);
    b.addEventListener("chargingchange", show);
  }).catch(function () {});
}

// ── input ──────────────────────────────────────────────────────────────────

function rotate(dir) {
  if (off) return;
  wake();
  if (dialog) {
    var s = Math.max(0, Math.min(1, dialog.sel + dir));
    if (s !== dialog.sel) { dialog.sel = s; drawDialog(); tickSound(); }
    return;
  }
  if (top().rotate(dir)) tickSound();
}
function select() {
  if (off) return boot();
  wake();
  tickSound();
  if (dialog) return closeDialog(dialog.sel === 1);
  top().select();
}
function menu() {
  if (off) return boot();
  wake();
  tickSound();
  if (dialog) return closeDialog(false);
  pop();
}

function wireWheel() {
  var wheel = document.getElementById("ipod-wheel");
  var center = document.getElementById("ipod-center");
  var drag = null;

  var angle = function (e) {
    var r = wheel.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
  };

  wheel.addEventListener("pointerdown", function (e) {
    if (e.target === center) return;
    wheel.setPointerCapture(e.pointerId);
    drag = { last: angle(e), acc: 0, moved: 0 };
  });
  wheel.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var a = angle(e);
    var d = a - drag.last;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    drag.last = a;
    drag.acc += d;
    drag.moved += Math.abs(d);
    // clockwise scrolls down, like an iPod
    while (drag.acc >= STEP_DEG) { rotate(1); drag.acc -= STEP_DEG; }
    while (drag.acc <= -STEP_DEG) { rotate(-1); drag.acc += STEP_DEG; }
  });
  wheel.addEventListener("pointerup", function (e) {
    if (!drag) return;
    var tap = drag.moved < 8;
    drag = null;
    if (!tap) return;
    // a tap on the ring: which quarter was it?
    var a = angle(e);
    if (a >= -135 && a < -45) press("menu");
    else if (a >= -45 && a < 45) press("next");
    else if (a >= 45 && a < 135) press("play");
    else press("prev");
  });
  wheel.addEventListener("pointercancel", function () { drag = null; });

  center.addEventListener("pointerdown", function () { center.classList.add("down"); });
  center.addEventListener("pointerup", function () { center.classList.remove("down"); });
  center.addEventListener("pointerleave", function () { center.classList.remove("down"); });
  center.addEventListener("click", select);

  // mouse wheel over the click wheel scrolls (and doesn't scroll the page)
  var wheelAcc = 0;
  wheel.addEventListener("wheel", function (e) {
    e.preventDefault();
    wheelAcc += e.deltaY;
    while (wheelAcc >= 40) { rotate(1); wheelAcc -= 40; }
    while (wheelAcc <= -40) { rotate(-1); wheelAcc += 40; }
  }, { passive: false });

  // keyboard, when the iPod has focus
  document.getElementById("ipod").addEventListener("keydown", function (e) {
    var k = e.key;
    if (k === "ArrowDown") rotate(1);
    else if (k === "ArrowUp") rotate(-1);
    else if (k === "Enter") select();
    else if (k === "Escape" || k === "Backspace") menu();
    else if (k === " ") press("play");
    else if (k === "ArrowRight") press("next");
    else if (k === "ArrowLeft") press("prev");
    else return;
    e.preventDefault();
  });
}

function press(what) {
  var ic = document.querySelector("#ipod-wheel .ic-" + what);
  ic.classList.add("down");
  setTimeout(function () { ic.classList.remove("down"); }, 140);
  if (what === "menu") return menu();
  if (off) return boot();
  if (dialog) return;
  wake();
  tickSound();
  if (what === "play") playPause();
  else if (what === "next") nextSong();
  else if (what === "prev") prevSong();
}

// backlight: dim the screen after a while without input (Settings > Backlight)
function wake() {
  lcd.classList.remove("dim");
  clearTimeout(dimTimer);
  if (settings.backlight !== "always") {
    dimTimer = setTimeout(function () { lcd.classList.add("dim"); }, Number(settings.backlight) * 1000);
  }
}

// the click wheel's tick: a tiny burst of noise (Settings > Clicker)
function tickSound() {
  if (!settings.clicker) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    var len = Math.floor(audio.sampleRate * 0.004);
    var buf = audio.createBuffer(1, len, audio.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    var src = audio.createBufferSource();
    var gain = audio.createGain();
    gain.gain.value = 0.18;
    src.buffer = buf;
    src.connect(gain).connect(audio.destination);
    src.start();
  } catch { /* no audio: fine */ }
}
