// The live room: one WebSocket to the server, which sends the whole room state
// after every change. Each screen (lobby, game, voting) is a fixed skeleton of
// regions; on every update only regions whose HTML changed are rewritten, so
// the video keeps playing and half-typed settings aren't wiped.

import {
  WS_URL, esc, setTitle, playlistPickerHtml, wirePlaylistPicker, readPlaylistPicker, clearToken,
} from "./util.js";

var HOW_TO_PLAY =
  "<ol class=\"steps\">" +
  "<li>The host makes a room and sends the invite link.</li>" +
  "<li>Two people sit in the player seats. Everyone else watches.</li>" +
  "<li>Each round, players take turns: listen through 3 songs and keep one. The last round has 5.</li>" +
  "<li>At the end the watchers hand out +1s to the picks they liked (no watchers? the host does).</li>" +
  "<li>The host hits Finish and the winner is announced.</li>" +
  "</ol>";

var root, flash, body;
var ws = null;
var code = "";
var token = "";
var state = null;
var layout = "";
var regions = {};
var currentVideo = {};
var modalDismissed = false;
var retries = 0;
var retryTimer = null;
var stopped = false;
var hooks = {};

export function openRoom(roomCode, roomToken, options) {
  root = document.getElementById("screen-room");
  flash = document.getElementById("room-flash");
  body = document.getElementById("room-body");
  code = roomCode;
  token = roomToken;
  hooks = options || {};
  stopped = false;
  state = null;
  layout = "";
  regions = {};
  currentVideo = {};
  body.innerHTML = '<div class="box"><div class="box-body loading"><span class="spinner"></span> connecting to room ' + esc(code) + "</div></div>";
  setTitle("joining room " + code);
  if (!root.dataset.wired) {
    root.addEventListener("click", onClick);
    document.getElementById("tab-status").addEventListener("click", onClick); // the invite link button
    root.dataset.wired = "1";
  }
  connect();
}

function connect() {
  ws = new WebSocket(WS_URL + "/ws/rooms/" + encodeURIComponent(code) + "?token=" + encodeURIComponent(token));
  ws.onopen = function () {
    retries = 0;
    showFlash("");
  };
  ws.onmessage = function (e) {
    var msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === "state") render(msg);
    else if (msg.type === "error") showFlash(msg.message, "error");
    else if (msg.type === "removed") {
      if (msg.reason === "left") {
        stop();
        clearToken(code);
        if (hooks.onExit) hooks.onExit();
      } else if (msg.reason === "lost connection") {
        gone("You were away too long, so you were taken out of the room.", true);
      } else {
        gone("The host removed you from the room.");
      }
    }
  };
  ws.onclose = function (e) {
    if (stopped) return;
    if (e.code === 4404) return gone("Room " + code + " doesn't exist any more. Rooms reset when the server restarts.");
    if (e.code === 4401) return gone("You're no longer in room " + code + ". You can join it again.", true);
    if (e.code === 4403) return; // "removed" message already handled it
    retries += 1;
    showFlash("Lost the connection, reconnecting...", "warn");
    retryTimer = setTimeout(connect, Math.min(1000 * retries, 5000));
  };
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function stop() {
  stopped = true;
  clearTimeout(retryTimer);
  if (ws) ws.close();
  document.body.classList.remove("in-game");
}

// The room is gone for us (left, kicked, missing). Offer a way back.
function gone(message, canRejoin) {
  stop();
  clearToken(code);
  layout = "";
  showFlash("");
  setTitle("left the room");
  body.innerHTML =
    '<div class="box"><div class="box-head">Room ' + esc(code) + '</div><div class="box-body">' +
    "<p>" + esc(message) + "</p>" +
    (canRejoin ? '<button class="btn btn-go" data-act="rejoin">Join again</button> ' : "") +
    '<button class="btn" data-act="home">Back home</button></div></div>';
}

function showFlash(text, kind) {
  flash.innerHTML = text ? '<div class="flash ' + (kind || "") + '">' + esc(text) + "</div>" : "";
}

// ── helpers ────────────────────────────────────────────────────────────────

function setRegion(id, html) {
  if (regions[id] === html) return;
  var el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = html;
  regions[id] = html;
}

function setVideo(id, videoId, autoplay) {
  if (currentVideo[id] === videoId) return;
  var el = document.getElementById(id);
  if (!el) return;
  currentVideo[id] = videoId;
  el.innerHTML = videoId
    ? '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(videoId) +
      "?autoplay=" + (autoplay ? 1 : 0) + '&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="video"></iframe>'
    : '<div class="novideo">no video loaded</div>';
}

function trackTitle(t) {
  if (!t) return "";
  return t.name + " - " + t.artists.map(function (a) { return a.name; }).join(", ");
}

function act(msg, label, cls) {
  return "<button class=\"btn " + (cls || "") + "\" data-act=\"send\" data-msg='" + esc(JSON.stringify(msg)) + "'>" + label + "</button>";
}

function personLabel(p) {
  var tags = [];
  if (p.is_host) tags.push("host");
  if (state.you.id === p.id) tags.push("you");
  return "<b>" + esc(p.name) + "</b>" + (tags.length ? ' <span class="small">(' + tags.join(", ") + ")</span>" : "");
}

function presence(p) {
  return p.connected
    ? '<img class="online" src="/icons/online-cd.png" alt="online" title="online">'
    : '<span class="away" title="away">away</span>'; // to be swapped for the afk / disconnected gif
}

function seatName(n) {
  return state.player_names[n] || (state.seats[n] && state.seats[n].name) || "player " + n;
}

// ── render ─────────────────────────────────────────────────────────────────

function render(s) {
  state = s;
  var next = s.status === "lobby" ? "lobby" : s.status === "active" ? "game" : "votes";
  if (next !== layout) {
    layout = next;
    regions = {};
    currentVideo = {};
    body.innerHTML = SKELETONS[next];
    if (next === "lobby") wirePlaylistPicker(document.getElementById("r-settings"), "room-pl");
  }
  if (s.status !== "results") modalDismissed = false;

  document.body.classList.toggle("in-game", next !== "lobby");
  var p1 = s.seats["1"], p2 = s.seats["2"];
  // top right of the tab bar: the link for inviting people to watch
  var link = location.origin + location.pathname + "?room=" + s.code;
  setRegion("tab-status", '<button class="btn" data-act="copy" data-text="' + esc(link) + '">Copy invite link</button>');

  if (next === "lobby") renderLobby(s, p1, p2);
  else if (next === "game") renderGame(s);
  else renderVotes(s);
}

var LEAVE = '<button class="btn btn-red no-fx" data-act="leave">Leave room</button>'; // no hover effects

var SKELETONS = {
  lobby:
    '<div class="room-head"><h2 class="h">room <span id="r-code"></span></h2>' + LEAVE + "</div>" +
    '<div id="r-notice"></div>' +
    '<div class="box"><div class="box-head">Invite Your Friends</div><div class="box-body" id="r-invite"></div></div>' +
    '<div class="cols2">' +
    "<div>" +
    '<div class="box no-blimp"><div class="box-head no-splat">Players</div><div id="r-seats"></div></div>' +
    '<div class="box no-blimp"><div class="box-head no-splat">Watching</div><div id="r-watchers"></div></div>' +
    '<div class="box no-blimp"><div class="box-head no-splat">Room Settings</div><form class="box-body" id="r-settings" onsubmit="return false"></form></div>' +
    "</div>" +
    "<div>" +
    '<div class="box no-blimp"><div class="box-head">Start The Game</div><div class="box-body" id="r-start"></div></div>' +
    '<div class="box no-blimp"><div class="box-head">How To Play</div><div class="box-body">' + HOW_TO_PLAY + "</div></div>" +
    "</div>" +
    "</div>",

  game:
    '<div class="room-head"><h2 class="h" id="g-heading"></h2><span class="room-head-right"><b id="g-round"></b>' + LEAVE + "</span></div>" +
    '<div class="box no-blimp"><div class="video" id="g-video"></div></div>' +
    '<div class="box no-blimp"><div class="box-body" id="g-controls"></div></div>' +
    '<div class="box no-blimp"><div class="box-head">In The Audience</div><div id="g-people"></div></div>',

  votes:
    '<div class="room-head"><h2 class="h" id="v-heading"></h2>' + LEAVE + "</div>" +
    '<div class="cols-votes">' +
    '<div class="box"><div class="box-head" id="v-title">Now Playing</div><div class="video" id="v-video"></div></div>' +
    '<div class="box"><div class="box-head">Scorecard</div><div class="box-body" id="v-score"></div></div>' +
    "</div>" +
    '<div class="box"><div class="box-head">Every Pick <span class="more" id="v-count"></span></div><div id="v-picks"></div></div>' +
    '<div id="v-modal"></div>',
};

function renderLobby(s, p1, p2) {
  var you = s.you;
  setTitle("room " + s.code + (p1 && p2 ? "" : ", waiting for players"));
  setRegion("r-code", esc(s.code));
  setRegion("r-notice", s.notice ? '<div class="flash warn">' + esc(s.notice) + "</div>" : "");

  var link = location.origin + location.pathname + "?room=" + s.code;
  setRegion(
    "r-invite",
    '<input class="txt invite" readonly value="' + esc(link) + '" onfocus="this.select()"> ' +
      '<button class="btn" data-act="copy" data-text="' + esc(link) + '">Copy link</button>' +
      ' <span class="small">or give them the code <b>' + esc(s.code) + "</b></span>"
  );

  // seats
  var rows = [1, 2].map(function (n) {
    var p = s.seats[n];
    var actions = "";
    if (!p) return "";
    if (p.id === you.id) actions = act({ type: "watch" }, "Watch instead");
    else if (you.is_host) {
      actions =
        act({ type: "move", member_id: p.id, to: "watch" }, "To watchers") +
        act({ type: "make_host", member_id: p.id }, "Make host") +
        act({ type: "kick", member_id: p.id }, "Kick", "btn-red");
    }
    return "<tr><td>" + personLabel(p) + "</td><td>" + presence(p) + "</td><td class=\"acts\">" + actions + "</td></tr>";
  });
  rows = rows.join("");
  setRegion("r-seats", rows ? '<table class="tbl">' + rows + "</table>" : "");

  // watchers: one seat button that takes whichever seat is free
  var freeSeat = !s.seats[1] ? 1 : !s.seats[2] ? 2 : 0;
  var w = s.watchers.map(function (p) {
    var actions = "";
    if (p.id === you.id) {
      if (freeSeat) actions = act({ type: "sit", seat: freeSeat }, "Switch to seat", "btn-go");
    } else if (you.is_host) {
      actions =
        (freeSeat ? act({ type: "move", member_id: p.id, to: freeSeat }, "Move to seat") : "") +
        act({ type: "make_host", member_id: p.id }, "Make host") +
        act({ type: "kick", member_id: p.id }, "Kick", "btn-red");
    }
    return "<tr><td>" + personLabel(p) + "</td><td>" + presence(p) + "</td><td class=\"acts\">" + actions + "</td></tr>";
  });
  setRegion(
    "r-watchers",
    w.length ? '<table class="tbl">' + w.join("") + "</table>" : "" // left empty: a gif goes here later
  );

  // settings (host edits; everyone else reads)
  var st = s.settings;
  if (you.is_host) {
    var opts = "";
    for (var r = 2; r <= 10; r++) opts += "<option" + (r === st.num_rounds ? " selected" : "") + ">" + r + "</option>";
    setRegion(
      "r-settings",
      '<div class="field"><div class="label">playlist</div>' + playlistPickerHtml("room-pl", st.playlist_id) + "</div>" +
        '<div class="field"><label class="label" for="room-rounds">rounds</label> <select id="room-rounds" class="txt">' + opts + "</select></div>" +
        '<button class="btn" data-act="save-settings">Save settings</button>'
    );
  } else {
    setRegion(
      "r-settings",
      '<table class="tbl plain"><tr><td class="label">playlist</td><td>' + esc(st.playlist_name) + "</td></tr>" +
        '<tr><td class="label">rounds</td><td>' + st.num_rounds + "</td></tr></table>" +
        '<div class="small">Only the host can change these.</div>'
    );
  }

  var host = [p1, p2].concat(s.watchers).find(function (p) { return p && p.is_host; });
  setRegion(
    "r-start",
    you.is_host
      ? '<img class="deco deco-center" src="/icons/equalizer.png" alt="">' +
        '<button class="btn btn-go btn-big wide btn-ic ic-start' + (p1 && p2 ? "" : " is-off") + '" data-act="send" data-msg=\'{"type":"start"}\'>Start game</button>' +
          (p1 && p2 ? "" : '<div class="small center">needs two players in the seats</div>')
      : '<img class="deco deco-center" src="/icons/equalizer.png" alt="">' +
          "Waiting for " + esc(host ? host.name : "the host") + " to start the game."
  );
}

function renderGame(s) {
  var g = s.game;
  var you = s.you;
  var myTurn = you.seat === g.active;
  var track = g.choices[g.index];
  var isFinal = g.round === g.num_rounds;
  var activeName = seatName(g.active);

  setTitle((myTurn ? "your turn" : activeName + " is picking") + " (round " + g.round + " of " + g.num_rounds + ")");
  setRegion("g-heading", myTurn ? esc(activeName) + ", it's your turn!" : esc(activeName) + " is picking...");
  setRegion("g-round", "Round " + g.round + "/" + g.num_rounds);
  setVideo("g-video", track && track.youtube_video_id, true);

  // song n of 3 (or 5): a row of numbered boxes, heard ones filled, current one lit
  var pips = "";
  for (var i = 0; i < g.choices.length; i++) {
    pips += '<span class="pip' + (i < g.index ? " heard" : i === g.index ? " now" : "") + '">' + (i + 1) + "</span>";
  }
  var status = g.loading ? '<span class="loading"><span class="spinner"></span> getting songs</span>' : g.error ? esc(g.error) : '<span class="pips">' + pips + "</span>";
  // each player's latest pick: "sahil picked Song Name" (a blank until they've picked)
  var lastPick = function (n) {
    var list = g.picks[String(n)];
    var t = list[list.length - 1];
    return "<b>" + esc(seatName(n)) + "</b> picked " + (t ? "<i>" + esc(t.name) + "</i>" : "___");
  };
  var counts = lastPick(1) + " &nbsp;|&nbsp; " + lastPick(2);

  var controls;
  if (myTurn && !g.loading) {
    var nextLabel = g.active === 1 ? esc(seatName(2)) + "'s turn" : isFinal ? "Finish and vote" : "Next round";
    controls =
      '<div class="pick-btns">' +
      act({ type: "pick" }, "Pick this song", "btn-go btn-big btn-ic ic-pick" + (g.picked || !track ? " is-off" : "")) +
      act({ type: "next" }, "Next song", "btn-big" + (g.index >= g.choices.length - 1 ? " is-off" : "")) +
      (g.can_go_back ? act({ type: "back" }, isFinal ? "Go back (once)" : "Go back", "btn-big") : "") +
      "</div>" +
      (g.picked ? '<div class="pick-btns">' + act({ type: "advance" }, nextLabel, "btn-go btn-big") + "</div>" : "");
  } else {
    controls = "<b>" + (you.seat ? "Waiting for " + esc(activeName) + " to pick. You're listening along." : "You're watching. " + esc(activeName) + " is picking.") + "</b>";
  }
  var retry = g.error && !g.loading && (you.is_host || myTurn) ? " " + act({ type: "retry" }, "Try loading songs again") : "";

  setRegion(
    "g-controls",
    '<div class="row-between"><span>' + status + "</span><span>" + counts + "</span></div>" +
      '<div class="controls">' + controls + retry + "</div>"
  );

  // the audience: everyone watching (left empty when nobody is)
  var watchers = s.watchers.map(function (p) {
    return "<tr><td>" + personLabel(p) + "</td><td>" + presence(p) + "</td></tr>";
  });
  setRegion("g-people", watchers.length ? '<table class="tbl">' + watchers.join("") + "</table>" : "");
}

function renderVotes(s) {
  var g = s.game;
  var you = s.you;
  var t1 = s.tally["1"], t2 = s.tally["2"];
  var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
  var score1 = sum(t1), score2 = sum(t2);
  var n1 = seatName(1), n2 = seatName(2);
  var results = s.status === "results";

  setTitle(results ? (s.result.winner ? seatName(s.result.winner) + " wins!" : "it's a tie!") : "voting");
  setRegion("v-heading", (results ? "final scores" : "time to vote!") + ' <img class="deco deco-inline" src="/icons/four-stars.png" alt="">');

  var np = s.now_playing;
  var playing = np ? g.picks[String(np.player)][np.index] : null;
  setRegion("v-title", playing ? esc(trackTitle(playing)) : you.is_host ? "click a song below to play it" : "the host picks what plays");
  setVideo("v-video", playing && playing.youtube_video_id, true);

  // scorecard
  var who = s.voters_are === "watchers"
    ? "The watchers vote: " + s.voters.map(function (v) { return esc(v.name) + " (" + v.votes + ")"; }).join(", ")
    : "Nobody is watching, so the host votes.";
  var mine = you.can_vote
    ? "You're a voter. Give a +1 to every pick you liked."
    : you.seat ? "You played, so you don't vote this time." : "";
  var hostBtn = "";
  if (you.is_host) {
    hostBtn = results
      ? act({ type: "rematch" }, "Rematch", "btn-go btn-big wide")
      : act({ type: "finish" }, "Finish and announce winner", "btn-go btn-big wide");
  } else {
    hostBtn = '<div class="small">' + (results ? "Waiting for the host to start a rematch." : "The host finishes the vote when everyone's done.") + "</div>";
  }
  setRegion(
    "v-score",
    '<table class="scoreline"><tr>' +
      '<td class="who">' + esc(n1) + '</td><td class="num">' + score1 + '</td><td class="dash">:</td>' +
      '<td class="num">' + score2 + '</td><td class="who">' + esc(n2) + "</td></tr></table>" +
      (results ? '<div class="winner-line">' + (s.result.winner ? esc(seatName(s.result.winner)) + " wins!" : "It's a tie!") + "</div>" : "") +
      '<p class="small">' + who + "</p>" + (mine ? "<p>" + mine + "</p>" : "") + hostBtn
  );

  setRegion("v-count", (score1 + score2) + " +1s so far");

  // every pick, round by round
  var cell = function (player, i) {
    var t = g.picks[String(player)][i];
    if (!t) return "<td></td>";
    var count = (player === 1 ? t1 : t2)[i];
    var given = s.my_votes[String(player)].indexOf(i) !== -1;
    var isPlaying = np && np.player === player && np.index === i;
    var thumb = t.album && t.album.images && t.album.images[0] ? t.album.images[0].url : "";
    var titleHtml = you.is_host
      ? '<a href="#" class="song" data-act="send" data-msg=\'' + esc(JSON.stringify({ type: "play", player: player, index: i })) + "'>" + esc(t.name) + "</a>"
      : '<span class="song">' + esc(t.name) + "</span>";
    var vote = you.can_vote && !results
      ? act({ type: "vote", player: player, index: i }, "+1" + (given ? " given" : ""), given ? "btn-go is-on" : "") + ' <span class="small">' + count + "</span>"
      : '<b class="count">' + count + "</b> <span class=\"small\">+1</span>";
    return (
      '<td class="pick' + (isPlaying ? " playing" : "") + '">' +
      (thumb ? '<img src="' + esc(thumb) + '" alt="">' : "") +
      '<div class="pick-text">' + titleHtml + '<div class="small">' + esc(t.artists.map(function (a) { return a.name; }).join(", ")) +
      (isPlaying ? " &nbsp;<b>now playing</b>" : "") + "</div></div>" +
      '<div class="pick-vote">' + vote + "</div></td>"
    );
  };
  var rows = "";
  for (var i = 0; i < g.num_rounds; i++) {
    rows += '<tr><td class="rnd">' + (i + 1) + "</td>" + cell(1, i) + cell(2, i) + "</tr>";
  }
  setRegion(
    "v-picks",
    '<table class="tbl picks"><tr><th class="rnd">round</th><th>' + esc(n1) + " (" + score1 + ")</th><th>" + esc(n2) + " (" + score2 + ")</th></tr>" + rows + "</table>"
  );

  // the winner announcement window
  if (results && !modalDismissed) {
    var r = s.result;
    setRegion(
      "v-modal",
      '<div class="modal-bg"><div class="modal" role="dialog" aria-label="winner">' +
        '<div class="modal-head">and the winner is...</div>' +
        '<div class="modal-body">' +
        '<img class="deco deco-center" src="/icons/star-burst.png" alt="">' +
        '<div class="modal-winner">' + (r.winner ? esc(seatName(r.winner)) + "!" : "it's a tie!") + "</div>" +
        "<div>" + esc(n1) + " <b>" + r.scores["1"] + "</b> : <b>" + r.scores["2"] + "</b> " + esc(n2) + "</div>" +
        '<div class="modal-btns">' +
        (you.is_host ? act({ type: "rematch" }, "Rematch", "btn-go btn-big") : '<span class="small">The host can start a rematch.</span>') +
        ' <button class="btn btn-big" data-act="close-modal">Close</button></div>' +
        "</div></div></div>"
    );
  } else {
    setRegion("v-modal", "");
  }
}

// ── clicks ─────────────────────────────────────────────────────────────────

function onClick(e) {
  var el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  var what = el.dataset.act;
  if (what === "send") {
    e.preventDefault();
    if (el.classList.contains("is-off")) return;
    send(JSON.parse(el.dataset.msg));
  } else if (what === "leave") {
    send({ type: "leave" });
    // the server answers with "removed"; fall back in case the socket is down
    setTimeout(function () { if (!stopped) { stop(); clearToken(code); hooks.onExit && hooks.onExit(); } }, 800);
  } else if (what === "copy") {
    var text = el.dataset.text;
    var label = el.textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        el.textContent = "Copied";
        setTimeout(function () { el.textContent = label; }, 1500);
      }, function () {});
    }
  } else if (what === "save-settings") {
    var form = document.getElementById("r-settings");
    var pl = readPlaylistPicker(form, "room-pl");
    if (!pl) return showFlash("Paste a YouTube playlist link for the custom playlist.", "error");
    showFlash("");
    send({ type: "settings", playlist_id: pl.id, playlist_name: pl.name, num_rounds: Number(document.getElementById("room-rounds").value) });
  } else if (what === "close-modal") {
    modalDismissed = true;
    setRegion("v-modal", "");
  } else if (what === "rejoin") {
    hooks.onRejoin && hooks.onRejoin(code);
  } else if (what === "home") {
    hooks.onExit && hooks.onExit();
  }
}
