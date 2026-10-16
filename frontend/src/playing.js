// Is any music playing in this tab? Every YouTube iframe on the page (the
// iPod, the Featured Song, the room videos) tells us when it plays or pauses
// once we send it a "listening" message (the iframes need enablejsapi=1).
// onMusicChange(fn) calls fn(true/false) when "something is playing" flips.

var states = new Map(); // iframe window -> is it playing
var listeners = [];
var last = false;

function isYouTube(el) {
  return el.tagName === "IFRAME" && /youtube(-nocookie)?\.com\/embed\//.test(el.src);
}

function listen(frame) {
  try { frame.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*"); } catch { /* not ready */ }
}

// only iframes still on the page count (a new room song replaces its iframe)
function check() {
  var on = Array.from(document.querySelectorAll("iframe")).some(function (f) { return states.get(f.contentWindow); });
  if (on === last) return;
  last = on;
  listeners.forEach(function (fn) { fn(on); });
}

export function onMusicChange(fn) { listeners.push(fn); }

export function initMusicWatch() {
  window.addEventListener("message", function (e) {
    if (e.origin !== "https://www.youtube.com" && e.origin !== "https://www.youtube-nocookie.com") return;
    var d = e.data;
    if (typeof d === "string") { try { d = JSON.parse(d); } catch { return; } }
    if (!d) return;
    var state = d.event === "onStateChange" ? d.info : d.info && d.info.playerState;
    if (typeof state !== "number") return;
    states.set(e.source, state === 1);
    check();
  });
  document.addEventListener("load", function (e) { if (isYouTube(e.target)) listen(e.target); }, true);
  document.querySelectorAll("iframe").forEach(function (f) { if (isYouTube(f)) listen(f); });
  new MutationObserver(check).observe(document.body, { childList: true, subtree: true });
}
