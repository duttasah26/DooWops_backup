// Button click: tiny shapes pop out around a button and spin away. Mostly
// stars, then arrows, a few flowers and the odd paint splash, all in
// public/hover (lime, with black copies of the arrows; black stars are the
// lime ones with a CSS filter). Unavailable buttons throw red X's instead,
// and .no-fx buttons (Leave room) get nothing. The click itself is held back
// 450ms so the sparks show before the page reacts. On hover (not click) a dot
// equaliser comes on behind the button text (equaliser.js).
//   star0-6, flower0-4, splash0-1, arrow0-6-lime, arrow0-7-black, x0-1

import { createEqualiser } from "./equaliser.js";

var CLICK_DELAY = 450; // ms a click waits so the sparks can be seen

function pickN(n) { return Math.floor(Math.random() * n); }

// Each button gets its own equaliser the first time it's hovered: faint dark
// dots on the lime buttons, white on the red ones, lime on the dark ones.
var equalisers = new WeakMap();
function equaliserFor(btn) {
  var eq = equalisers.get(btn);
  if (!eq) {
    var rgb = btn.classList.contains("btn-go") ? "43,45,40" : btn.classList.contains("btn-red") ? "255,255,255" : "181,211,51";
    eq = createEqualiser(btn, rgb, 6, 1.5, undefined, btn.classList.contains("btn-go") ? 0.25 : undefined);
    equalisers.set(btn, eq);
  }
  return eq;
}

export function initHover() {
  document.addEventListener("mouseout", function (e) {
    var btn = e.target.closest(".btn");
    if (btn && !btn.contains(e.relatedTarget) && equalisers.has(btn)) equalisers.get(btn).stop();
  });
  document.addEventListener("mouseover", function (e) {
    var btn = e.target.closest(".btn");
    if (!btn || btn.contains(e.relatedTarget) || btn.classList.contains("no-fx")) return;
    if (!(btn.disabled || btn.classList.contains("is-off"))) equaliserFor(btn).start();
  });
  var held = new WeakSet(); // buttons whose click is waiting out the delay
  var replaying = null; // the button whose held click is being let through
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".btn");
    if (!btn || btn.classList.contains("no-fx") || btn === replaying) return;
    var off = btn.disabled || btn.classList.contains("is-off"); // unavailable: red X's instead
    if (!off) {
      // Hold the click back for a moment so the sparks show before the page
      // reacts (a new screen or a re-render would otherwise cut them off).
      e.preventDefault();
      e.stopImmediatePropagation();
      if (held.has(btn)) return;
      held.add(btn);
      setTimeout(function () {
        held.delete(btn);
        if (!btn.isConnected) return;
        replaying = btn;
        btn.click();
        replaying = null;
      }, CLICK_DELAY);
    }
    var r = btn.getBoundingClientRect();
    for (var n = 0; n < 7; n++) {
      var img = document.createElement("img");
      var black = Math.random() < 0.4;
      var roll = Math.random();
      img.className = off ? "spark spark-x" : black ? "spark spark-k" : "spark";
      img.alt = "";
      if (off) img.src = "/hover/x" + (n % 2) + ".png";
      else if (roll < 0.06) img.src = "/hover/splash" + pickN(2) + ".png"; // rare splash
      else if (roll < 0.60) img.src = "/hover/star" + pickN(7) + ".png"; // about half
      else if (roll < 0.70) img.src = "/hover/flower" + pickN(5) + ".png";
      else img.src = "/hover/arrow" + (black ? pickN(8) + "-black" : pickN(7) + "-lime") + ".png";
      var size = 8 + Math.random() * 6;
      img.style.width = size + "px";
      img.style.left = (r.left + window.scrollX + Math.random() * r.width - size / 2) + "px";
      var above = Math.random() < 0.5; // start above the button and drift up, or below and drift down
      img.style.top = (r.top + window.scrollY + (above ? -size * 0.6 : r.height - size * 0.4)) + "px";
      img.style.setProperty("--dx", (Math.random() * 50 - 25) + "px");
      img.style.setProperty("--dy", (above ? -1 : 1) * (10 + Math.random() * 20) + "px");
      img.style.setProperty("--rot", (Math.random() * 180 - 90) + "deg");
      document.body.appendChild(img);
      img.addEventListener("animationend", function () { this.remove(); });
    }
  }, true); // capture, so it runs before the page's own click handlers
}
