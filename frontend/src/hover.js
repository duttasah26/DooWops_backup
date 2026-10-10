// Button hover: tiny shapes pop out around a button and spin away. Mostly
// stars, then arrows, a few flowers and the odd paint splash, all in
// public/hover (lime, with black copies of the arrows; black stars are the
// lime ones with a CSS filter). Unavailable buttons throw red X's instead,
// and .no-fx buttons (Leave room) get nothing.
//   star0-6, flower0-4, splash0-1, arrow0-6-lime, arrow0-7-black, x0-1

function pickN(n) { return Math.floor(Math.random() * n); }

export function initHover() {
  document.addEventListener("mouseover", function (e) {
    var btn = e.target.closest(".btn");
    if (!btn || btn.contains(e.relatedTarget) || btn.classList.contains("no-fx")) return;
    var off = btn.disabled || btn.classList.contains("is-off"); // unavailable: red X's instead
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
  });
}
