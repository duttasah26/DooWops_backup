// Home page and sidebar bits: the date, the gif strips, the Get Started
// photos, the update log marquee and the chatbox.

// Marquee strips of the little badge gifs between sections. The row is
// written twice and scrolled by CSS, so a strip is full from the first frame
// (a <marquee> starts empty) and loops without a gap. It never pauses.
var BUTTON_GIFS = [
  "4music.gif", "brat.gif", "538-turnmeon.gif", "freely2.gif", "daft-punk.gif", "grillz.gif",
  "itv3.gif", "hardcore-tanoc.gif", "kiss.gif", "music.gif", "london2012.gif", "plastic.gif",
  "more4.gif", "three-question-button2.gif", "nokia.gif", "triples4.gif", "nrkp3.gif", "viva-happy.gif",
  "pool.gif", "wow-wow.gif", "radio-activity.gif", "y2k.gif", "techno.gif", "vevo.gif", "y2k4.gif",
];

// Get Started photos (public/photos), shuffled into the four columns each visit
var SECTION_PHOTOS = [
  "preity.jpg", "834dd3563c098f12d61ec9b299dfe8c6.jpg",
  "ad54690a380c8c4d9687fd636e5b18e9.jpg", "bbc643660ffae58577a0f2ea30572993.jpg",
];

export function initHome() {
  document.getElementById("date").textContent = new Date().toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  document.querySelectorAll(".gifstrip").forEach(function (strip, i) {
    // start each strip at a different gif so they don't line up
    var start = (i * 7) % BUTTON_GIFS.length;
    var shifted = BUTTON_GIFS.slice(start).concat(BUTTON_GIFS.slice(0, start));
    var html = shifted.map(function (g) { return '<img src="/badges/' + g + '" alt="">'; }).join("");
    strip.innerHTML = '<div class="gifstrip-track">' + html + html + "</div>";
  });

  // Chatbox: Chattable, styled after bielzin.space's chatbox (public/css/chattable.css).
  if (window.chattable) window.chattable.initialize({ stylesheet: "/css/chattable.css" });

  // "Get Started" row: a photo above each column, like MySpace's "Cool New
  // Videos". The photos in /photos are shuffled into the columns each visit.
  var photos = SECTION_PHOTOS.slice();
  for (var k = photos.length - 1; k > 0; k--) {
    var r = Math.floor(Math.random() * (k + 1));
    var tmp = photos[k]; photos[k] = photos[r]; photos[r] = tmp;
  }
  document.querySelectorAll(".gs-photo").forEach(function (img, i) {
    img.src = "/photos/" + photos[i % photos.length];
  });

  // Update log: scrolls up on its own like a marquee (never pauses), looping
  // over a second copy of the items so there's no jump.
  var newsList = document.querySelector(".news-list");
  if (newsList) {
    var count = newsList.children.length;
    newsList.innerHTML += newsList.innerHTML;
    setInterval(function () {
      var half = newsList.children[count].offsetTop - newsList.children[0].offsetTop;
      newsList.scrollTop += 1;
      if (newsList.scrollTop >= half) newsList.scrollTop -= half;
    }, 50);
  }
}
