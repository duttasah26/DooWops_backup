// A glossy panel wrapping a YouTube embed. Sized by its parent; the video
// keeps a 16:9 box so nothing gets squashed.
export default function YouTubePlayer({ videoId, title = "now playing", autoplay = true }) {
  return (
    <div className="win">
      <div className="win-title">
        <span className="truncate">{title}</span>
      </div>
      <div className="win-video">
        {videoId ? (
          <iframe
            key={videoId}
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${autoplay ? 1 : 0}&controls=1&rel=0`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            title={title}
          />
        ) : (
          <div
            style={{ aspectRatio: "16 / 9", lineHeight: "normal" }}
            className="flex items-center justify-center text-gray-400"
          >
            no video loaded
          </div>
        )}
      </div>
    </div>
  );
}
