import { useEffect, useState } from "react";

const NAV_GROUPS = [
  {
    title: "play!",
    color: "bg-retro-lime text-retro-black",
    links: [
      { label: "Home", key: "home" },
      { label: "How to Play" },
      { label: "Modes" },
    ],
  },
  {
    title: "about.dw",
    color: "bg-retro-teal text-white",
    links: [
      { label: "Credits" },
      { label: "Troubleshooting" },
      { label: "Contact" },
    ],
  },
  {
    title: "the.noise",
    color: "bg-retro-blue text-white",
    links: [
      { label: "Sound Check" },
      { label: "Fun Facts" },
      { label: "Source" },
    ],
  },
];

// Newest first. The marquee under the header shows the newest entry's note.
const UPDATE_LOG = [
  {
    date: "10 / 8 / 2026",
    title: "online 1v1 is here!",
    note: "online 1v1 is here! Make a room, send your friend the link and play from two computers.",
    items: [
      "play a friend on their own computer",
      "make a room, send the invite link or the 5-letter code",
      "everyone else can join and just watch",
      "the room leader picks what plays and gives out the points, live for everyone",
      "Home actually takes you home now",
      "the tab title changes with each screen",
    ],
  },
  {
    date: "10 / 8 / 2026",
    title: "big look refresh",
    items: [
      "glossy new panels and buttons",
      "bigger, easier to read text",
      "the video is now the main frame in game",
      "more ads from SideLink and NeoLink, plus a stamp wall",
    ],
  },
  {
    date: "7 / 31 / 2026",
    title: "chat + featured song",
    items: ["added a live chat box", "added the featured song section", "brand icon supersized"],
  },
  { date: "7 / 19 / 2026", title: "YouTube mode", items: ["play with any YouTube playlist, no Spotify needed"] },
  { date: "7 / 5 / 2026", title: "relaunch", items: ["site got the full retro relaunch"] },
];

const UPDATE_NOTE = `${UPDATE_LOG[0].date.replace(/ /g, "")} update: ${UPDATE_LOG[0].note || UPDATE_LOG[0].title} More soon~`;


const STAMPS = ["ipod.gif", "mtv.gif", "daft-punk.gif", "katy-perry.gif", "metro-ipod.gif", "neue-flower.gif", "ocean.gif", "metro2.gif"];

const BUTTON_GIFS = [
  "4music.gif", "538-turnmeon.gif", "daft-punk.gif", "itv3.gif", "kiss.gif", "london2012.gif", "more4.gif",
  "nokia.gif", "nrkp3.gif", "pool.gif", "radio-activity.gif", "techno.gif", "vevo.gif", "y2k4.gif",
];

// Sidebar chrome after DESIGN/image.png: a coloured pill header with the title
// in bold italic, flush right, then plain blue underlined links.
function PillHeader({ color = "bg-retro-black text-white", children }) {
  return (
    <div className={`${color} font-display italic text-[23px] leading-none text-right pr-4 pl-3 py-2 rounded-r-full`}>
      {children}
    </div>
  );
}

function SideNav({ onGoHome }) {
  return (
    <nav>
      {NAV_GROUPS.map(group => (
        <div key={group.title} className="mb-3">
          <PillHeader color={group.color}>{group.title}</PillHeader>
          <div className="flex flex-col px-4 pt-2 text-[16px] leading-snug">
            {group.links.map(link =>
              link.key === "home" ? (
                <button key={link.label} type="button" onClick={onGoHome} className="side-link text-left">
                  {link.label}
                </button>
              ) : (
                <span key={link.label} className="side-link">{link.label}</span>
              )
            )}
          </div>
        </div>
      ))}
    </nav>
  );
}

function UpdateLog() {
  return (
    <div className="mb-3">
      <PillHeader color="bg-retro-green text-white">update.log</PillHeader>
      <div className="max-h-72 overflow-y-auto mx-3 mt-2 pr-1 text-[13px] leading-snug">
        {UPDATE_LOG.map((entry, i) => (
          <div key={entry.date + entry.title} className="py-2 border-b border-dotted border-gray-400 last:border-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="bg-retro-lime text-retro-black font-bold text-[11px] px-1.5 rounded-sm">{entry.date}</span>
              {i === 0 && <span className="bg-red-600 text-white font-bold text-[10px] px-1 rounded-sm">new!</span>}
            </div>
            <div className="font-bold text-retro-olive">{entry.title}</div>
            <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
              {entry.items.map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// Ad slot after the image.png "ad" strip: a black bar with a row of grey dots.
function AdBox({ title, children }) {
  return (
    <div>
      <div className="bg-retro-black flex items-center justify-end gap-1 px-1.5 py-1">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <span key={i} className="w-4 h-4 rounded-full" style={{ background: `hsl(0 0% ${45 + i * 9}%)` }} />
        ))}
        <span className="ml-1 rounded-full bg-white text-retro-black text-[12px] font-bold px-1.5 leading-4">{title}</span>
      </div>
      <div className="py-2">{children}</div>
    </div>
  );
}

// SideLink Ads (dogspit.nekoweb.org): embedded with their fullsize code as given,
// 150x450 with no border. Rotates a new ad every 30 seconds.
function SideLink() {
  return (
    <div className="flex justify-center">
      <iframe
        width="150"
        height="450"
        style={{ border: "none" }}
        src="https://dogspit.nekoweb.org/sidelink.html"
        name="sidelink"
        title="SideLink Ads"
      />
    </div>
  );
}

// NeoLink rotator (dimden), square format.
function NeoLink() {
  return (
    <div className="flex justify-center">
      <iframe width="180" height="180" style={{ border: "none" }} src="https://nvlk.dimden.dev/" name="neolink" title="NeoLink" />
    </div>
  );
}

function Stamps({ cols = 2 }) {
  return (
    <div className="stamps" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {STAMPS.map(name => <img key={name} src={`/stamps/${name}`} alt="" />)}
    </div>
  );
}

function LiveChat() {
  useEffect(() => {
    if (window.chattable) {
      window.chattable.initialize();
    }
  }, []);

  return (
    <div>
      <PillHeader color="bg-retro-blue text-white">live.chat</PillHeader>
      <iframe
        id="chattable"
        src="https://iframe.chat/embed?chat=doo-wops"
        frameBorder="0"
        className="w-full h-64 block mt-2"
        title="live chat"
      />
    </div>
  );
}

// Game-mode replacement for the left sidebar: one strip of hover dropdowns
// (click toggles too, for touch screens).
function TopNav({ onGoHome, status }) {
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (open === null) return;
    const close = () => setOpen(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  return (
    <ul className="topnav">
      <li><a href="#" onClick={e => { e.preventDefault(); onGoHome(); }}>home</a></li>
      {NAV_GROUPS.map(group => (
        <li key={group.title} className={open === group.title ? "open" : ""}>
          <button
            type="button"
            aria-haspopup="true"
            aria-expanded={open === group.title}
            onClick={e => { e.stopPropagation(); setOpen(o => (o === group.title ? null : group.title)); }}
          >
            {group.title}
          </button>
          <ul>
            {group.links.map(link => (
              <li key={link.label}>
                {link.key === "home" ? (
                  <button type="button" onClick={onGoHome}>quit to home</button>
                ) : (
                  <span>{link.label}</span>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
      {status && <li className="topnav-right"><span>{status}</span></li>}
    </ul>
  );
}

export default function RetroShell({ children, onGoHome, variant = "full", status }) {
  const isGame = variant === "game";
  const dateStr = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="crt">
      <div className="relative min-h-screen w-full flex justify-center">
        <img
          src="/background/RM94-2.png"
          alt=""
          className="fixed inset-0 w-full h-full object-cover"
        />
        <video
          className="bg-video fixed inset-0 w-full h-full object-cover"
          src="/background/background.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
        />
        <div className="relative w-full max-w-retro bg-white flex flex-col">
          <div className={`flex items-stretch bg-white ${isGame ? "h-24" : "h-32 md:h-40"}`}>
            <div className="w-[240px] md:w-[230px] shrink-0 flex items-center justify-center bg-white overflow-hidden">
              <img src="/doo_wops_icon.png" alt="doo-wops!" className="max-h-full max-w-full object-contain" />
            </div>
            <div className="flex-1 overflow-hidden">
              <img src="/500x100-banner.gif" alt="Let's make some noise" className="w-full h-full object-cover" />
            </div>
          </div>

          <div className="flex items-stretch h-8">
            <div className="w-[240px] md:w-[230px] shrink-0 flex items-center justify-center bg-retro-lime text-retro-black text-[13px] font-bold">
              {dateStr}
            </div>
            <div className="flex-1 bg-retro-black text-retro-lime text-[14px] font-bold overflow-hidden flex items-center">
              <marquee behavior="scroll" direction="left" scrollamount="5" className="w-full">
                {UPDATE_NOTE}
              </marquee>
            </div>
          </div>

          {isGame && <TopNav onGoHome={onGoHome} status={status} />}

          <div className="flex flex-1 flex-col md:flex-row">
            {!isGame && (
              <aside className="w-full md:w-[230px] shrink-0 pt-3">
                <SideNav onGoHome={onGoHome} />
                <UpdateLog />
                <AdBox title="ad"><NeoLink /></AdBox>
                <img src="/vert-box-banner.gif" alt="" className="w-full h-auto pixelated" />
              </aside>
            )}

            <main className="flex-1 min-w-0 p-3">
              {children}
              {isGame && (
                <div className="mt-3 flex flex-col sm:flex-row gap-3">
                  <div className="sm:w-[180px] shrink-0"><AdBox title="ad"><NeoLink /></AdBox></div>
                  <div className="flex-1 min-w-0"><AdBox title="ad"><Stamps cols={4} /></AdBox></div>
                </div>
              )}
            </main>

            <aside className="w-full md:w-[190px] shrink-0 pt-3">
              <LiveChat />
              <AdBox title="ad"><SideLink /></AdBox>
              {!isGame && <AdBox title="ad"><div className="px-1.5"><Stamps /></div></AdBox>}
            </aside>
          </div>

          <footer className="bg-retro-black text-white pb-3">
            <div className="text-right text-[13px] px-4 py-2">
              All assets used belong to their respective owners. &copy; doo-wops 2026
            </div>
            <div className="flex justify-center px-3">
              <div className="rounded-full bg-white px-5 py-1.5 flex flex-wrap items-center gap-x-2 text-[16px] text-retro-black">
                {["Credits", "Contact", "Source", "Guestbook"].map((label, i) => (
                  <span key={label} className="flex items-center gap-2">
                    {i > 0 && <span>|</span>}
                    <span className="side-link">{label}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="btnwall px-3 pt-3">
              {BUTTON_GIFS.map(name => <img key={name} src={`/buttons/${name}`} alt="" />)}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
