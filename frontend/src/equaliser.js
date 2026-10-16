// A grid of little dots that bounces like an audio equaliser, drawn on a
// canvas behind the host's content. The motion is fake (random bar heights,
// eased), it isn't tied to any audio. Used as the background of the three
// columns (always on) and behind a button while hovered. Only the lit dots are
// drawn. maxRows caps how tall the bars get (default: the whole host), alpha
// is the dot opacity (default .55).
// The canvas fades in and out with the .eq / .eq.on CSS.

export function createEqualiser(host, rgb, gap, radius, maxRows, alpha) {
  var canvas = document.createElement("canvas");
  canvas.className = "eq";
  host.prepend(canvas);
  var ctx = canvas.getContext("2d");
  var bars = [], targets = [], frame, stopTimer, nextTarget, rows, w, h;

  // match the host's size (the middle column grows and shrinks between screens),
  // drawn at the screen's pixel ratio so the dots stay sharp
  function resize() {
    var dpr = window.devicePixelRatio || 1;
    w = host.clientWidth;
    h = host.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rows = Math.min(Math.floor(h / gap), maxRows || Infinity);
    var cols = Math.floor(w / gap);
    while (bars.length < cols) { bars.push(0); targets.push(0); }
    bars.length = targets.length = cols;
  }

  function draw(now) {
    if (now > nextTarget) {
      for (var i = 0; i < targets.length; i++) targets[i] = Math.random() * rows;
      nextTarget = now + 140;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(" + rgb + "," + (alpha || 0.55) + ")";
    for (var c = 0; c < bars.length; c++) {
      bars[c] += (targets[c] - bars[c]) * 0.2;
      for (var r = 0; r < bars[c]; r++) {
        ctx.beginPath();
        ctx.arc(gap / 2 + c * gap, h - gap / 2 - r * gap, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    frame = requestAnimationFrame(draw);
  }

  return {
    start: function () {
      clearTimeout(stopTimer);
      cancelAnimationFrame(frame);
      bars = []; targets = [];
      // a form can rewrite its button's contents (Create room's loader), which
      // removes the canvas: put it back
      if (canvas.parentNode !== host) host.prepend(canvas);
      resize();
      nextTarget = 0;
      canvas.classList.add("on");
      frame = requestAnimationFrame(draw);
      if (!this.watching && window.ResizeObserver) {
        this.watching = true;
        new ResizeObserver(resize).observe(host);
      }
    },
    stop: function () {
      canvas.classList.remove("on");
      // let the CSS fade-out finish before the loop stops
      stopTimer = setTimeout(function () { cancelAnimationFrame(frame); }, 250);
    },
  };
}

// The white dots in the bottom-right corner of a section: the same square grid of dots
// as the equaliser (12px apart, 3.9px radius), but sitting in a 108px corner patch, with
// bars that bounce at random like the equaliser and an opacity that fades out away from
// the corner. It sits under the box's content (.eq-corner in boxes.css). It keeps
// looping while the screen is hidden but doesn't draw, and stops when its box is removed.
export function createCornerEqualiser(host) {
  var SIZE = 108, GAP = 12, R = 3.9, FADE = 118;
  var cols = Math.floor(SIZE / GAP);
  var dpr = window.devicePixelRatio || 1;
  var canvas = document.createElement("canvas");
  canvas.className = "eq-corner";
  canvas.width = Math.round(SIZE * dpr);
  canvas.height = Math.round(SIZE * dpr);
  host.prepend(canvas);
  var ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  var bars = [], targets = [];
  for (var i = 0; i < cols; i++) { bars.push(cols / 2); targets.push(cols / 2); }
  var next = 0;
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function draw(now) {
    if (!canvas.isConnected) return; // the box was redrawn: this loop ends with it
    if (!still) requestAnimationFrame(draw);
    if (canvas.offsetParent === null) return; // hidden screen: keep looping, don't draw
    if (now > next) {
      for (var i = 0; i < cols; i++) targets[i] = 1 + Math.random() * (cols - 1);
      next = now + 140;
    }
    ctx.clearRect(0, 0, SIZE, SIZE);
    for (var c = 0; c < cols; c++) {
      bars[c] += (targets[c] - bars[c]) * 0.2;
      var x = SIZE - GAP / 2 - c * GAP;
      for (var m = 0; m < bars[c]; m++) {
        var y = SIZE - GAP / 2 - m * GAP;
        var a = Math.max(0, 1 - Math.hypot(SIZE - x, SIZE - y) / FADE);
        if (a < 0.05) continue;
        ctx.fillStyle = "rgba(255,255,255," + Math.pow(a, 1.15).toFixed(2) + ")";
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  requestAnimationFrame(draw);
}
