// The animated white dots in a section's bottom-right corner (equaliser.js). They go on
// most sections. Not on the Create / Join forms. Inside a room only the bottom-right
// box has them, and a room redraws its boxes, so this runs again whenever they change.

import { createCornerEqualiser } from "./equaliser.js";

var SELECTORS = [
  "#screen-home .box",
  "#screen-setup .box:not(form)",
  "#room-body .cols2 > div:last-child > .box:last-child",
  "#room-body > .box:last-child",
  "#room-body .box:has(> #v-picks)",
].join(", ");

function attach() {
  document.querySelectorAll(SELECTORS).forEach(function (box) {
    if (!box.querySelector(":scope > .eq-corner")) createCornerEqualiser(box);
  });
}

export function initCorners() {
  attach();
  new MutationObserver(attach).observe(document.getElementById("main"), { childList: true, subtree: true });
}
