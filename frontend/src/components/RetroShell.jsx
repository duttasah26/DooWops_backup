const UPDATE_NOTE = "19.03 Update - Now with YouTube mode! Also: live chat box + featured song section just went up. More soon~";

const NAV_GROUPS = [
  {
    title: "play!",
    color: "bg-retro-teal",
    links: [
      { label: "Home", key: "home" },
      { label: "How to Play" },
      { label: "Modes" },
    ],
  },
  {
    title: "about.dw",
    color: "bg-retro-green",
    links: [
      { label: "Credits" },
      { label: "Troubleshooting" },
      { label: "Contact" },
    ],
  },
  {
    title: "the.noise",
    color: "bg-retro-blue",
    links: [
      { label: "Sound Check" },
      { label: "Fun Facts" },
      { label: "Source" },
    ],
  },
];

const FOOTER_BUTTON_GIFS = [
  "4music.gif",
  "kiss.gif",
  "more4.gif",
  "nokia.gif",
  "vevo.gif",
  "y2k4.gif",
];

const UPDATE_LOG = [
  { date: "07/31/26", items: ["added a live chat box", "added the featured song section", "brand icon supersized"] },
  { date: "07/19/26", items: ["now with YouTube mode!"] },
  { date: "07/05/26", items: ["site got the full retro relaunch"] },
];

const FAKE_CHAT = [
  { name: "sam_88", time: "2m ago", text: "let's gooo" },
  { name: "alexr", time: "5m ago", text: "that yt mode is clean" },
  { name: "guest4021", time: "9m ago", text: "hai :D" },
  { name: "vinylvic", time: "14m ago", text: "who's queuing up a 1v1" },
];

function SidebarSection({ title, color, links, onGoHome }) {
  return (
    <div className="mb-4 px-4">
      <div className={`${color} text-white font-display italic text-base px-4 py-1.5 rounded-r-full shadow`}>
        {title}
      </div>
      <div className="flex flex-col gap-1 pt-2 pb-1 text-sm">
        {links.map(link =>
          link.key === "home" ? (
            <button
              key={link.label}
              type="button"
              onClick={onGoHome}
              className="text-left text-retro-link underline hover:text-retro-linkvisited"
            >
              {link.label}
            </button>
          ) : (
            <span key={link.label} className="text-retro-link underline cursor-default opacity-90">
              {link.label}
            </span>
          )
        )}
      </div>
    </div>
  );
}

function UpdateLog() {
  return (
    <div className="px-4 mt-2">
      <div className="bg-retro-black text-white font-bold text-xs px-3 py-1.5 rounded-t flex items-center gap-1">
        📋 update log
      </div>
      <div className="border border-t-0 border-gray-300 bg-gray-50 max-h-40 overflow-y-auto text-xs px-3 py-2 space-y-2">
        {UPDATE_LOG.map(entry => (
          <div key={entry.date}>
            <div className="font-bold text-retro-olive">{entry.date}</div>
            <ul className="list-disc list-inside text-gray-700">
              {entry.items.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function StampCarousel() {
  return (
    <div className="mt-2">
      <img src="/vert-box-banner.gif" alt="" className="w-full h-auto pixelated" />
      <div className="w-full flex justify-center bg-gray-50 py-1">
        <iframe width="180" height="180" style={{ border: "none" }} src="https://nvlk.dimden.dev/" name="neolink" />
      </div>
    </div>
  );
}

function LiveChatBox() {
  return (
    <div className="p-3">
      <div className="bg-retro-blue text-white font-bold text-xs px-3 py-1.5 rounded-t flex items-center gap-1">
        💬 live chat
      </div>
      <div className="border border-t-0 border-gray-300 bg-gray-50 max-h-56 min-h-[140px] overflow-y-auto px-3 py-2 text-xs space-y-2">
        {FAKE_CHAT.map(m => (
          <div key={m.name}>
            <span className="font-bold text-retro-link">{m.name}</span>{" "}
            <span className="text-gray-400">{m.time}</span>
            <div className="text-gray-700">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="border border-t-0 border-gray-300 flex flex-col rounded-b overflow-hidden">
        <input
          disabled
          placeholder="name"
          className="text-xs px-2 py-1 border-b border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"
        />
        <input
          disabled
          placeholder="chat coming soon..."
          className="text-xs px-2 py-1 bg-gray-100 text-gray-400 cursor-not-allowed"
        />
      </div>
    </div>
  );
}

export default function RetroShell({ children, onGoHome }) {
  const dateStr = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="crt">
      <div
        className="min-h-screen w-full flex justify-center bg-retro-black font-gothic"
        style={{
          backgroundImage: "url(/background/RM94-2.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "fixed",
        }}
      >
        <div className="w-full max-w-retro bg-white flex flex-col shadow-2xl">
          <div className="flex items-stretch h-32 md:h-40 bg-white">
            <div className="w-[240px] md:w-[320px] shrink-0 flex items-center justify-center bg-white overflow-hidden">
              <img src="/doo_wops_icon.png" alt="doo-wops!" className="max-h-full max-w-full object-contain" />
            </div>
            <div className="flex-1 overflow-hidden">
              <img src="/500x100-banner.gif" alt="Let's make some noise" className="w-full h-full object-cover" />
            </div>
          </div>

          <div className="flex items-stretch h-6 md:h-7">
            <div className="w-[240px] md:w-[320px] shrink-0 flex items-center justify-center bg-retro-lime text-retro-black text-[10px] font-bold">
              {dateStr}
            </div>
            <div className="flex-1 bg-retro-black text-retro-lime text-sm overflow-hidden">
              <marquee behavior="scroll" direction="left" scrollamount="5">
                {UPDATE_NOTE}
              </marquee>
            </div>
          </div>

          <div className="flex flex-1 flex-col md:flex-row">
            <aside className="w-full md:w-[220px] shrink-0 bg-white border-b md:border-b-0 md:border-r border-gray-200 pt-2 pb-1">
              {NAV_GROUPS.map(group => (
                <SidebarSection key={group.title} {...group} onGoHome={onGoHome} />
              ))}
              <UpdateLog />
              <StampCarousel />
            </aside>

            <main className="flex-1 min-w-0 py-2 relative">{children}</main>

            <aside className="w-full md:w-[220px] shrink-0 bg-white border-t md:border-t-0 md:border-l border-gray-200">
              <LiveChatBox />
            </aside>
          </div>

          <div className="bg-retro-black text-white text-xs text-right px-3 py-1">
            All assets used belong to their respective owners. © doo-wops 2026
          </div>

          <div className="flex justify-center py-1.5">
            <div className="w-max px-4 py-1 rounded-full bg-white flex items-center gap-2 text-xs">
              {["Credits", "Contact", "Source"].map((label, i) => (
                <span key={label} className="flex items-center gap-2">
                  {i > 0 && <span className="opacity-50">|</span>}
                  <span className="text-retro-link underline cursor-default">{label}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2 pb-2">
            {FOOTER_BUTTON_GIFS.map(name => (
              <img
                key={name}
                src={`/buttons/${name}`}
                alt=""
                className="w-[150px] h-[20px] border border-gray-300 pixelated"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
