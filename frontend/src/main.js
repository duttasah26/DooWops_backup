// doo-wops! entry point: loads the styles and starts each part of the page.
//   screens.js  which screen is showing, navigation, ?room=CODE
//   forms.js    Create A Room / Join A Room
//   room.js     the live room (lobby, game, voting)
//   home.js     date, gif strips, Get Started photos, update log, chatbox
//   hover.js    the shapes that pop out when you hover a button
//   ipod.js     doo-wops Radio
//   util.js     shared helpers (backend calls, saved names/tokens, playlists)

import "./styles/index.css";
import { loadToken } from "./util.js";
import { initScreens, show, goSetup, enterRoom } from "./screens.js";
import { initForms } from "./forms.js";
import { initHome } from "./home.js";
import { initHover } from "./hover.js";
import { initIpod } from "./ipod.js";

initScreens();
initForms();
initHome();
initHover();
initIpod();

// an invite link (?room=CODE): back into the room if we have a seat token,
// otherwise the join form with the code filled in
var roomCode = (new URL(location.href).searchParams.get("room") || "").toUpperCase();
var roomToken = roomCode && loadToken(roomCode);
if (roomToken) enterRoom(roomCode, roomToken);
else if (roomCode) goSetup(roomCode);
else show("home");
