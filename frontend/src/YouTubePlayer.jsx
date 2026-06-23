export default function YouTubePlayer({ videoId }) {
  if (!videoId) return null;
  return (
    <iframe
      width="100%"
      height="120"
      src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=1`}
      allow="autoplay; encrypted-media"
      allowFullScreen
      className="rounded-lg"
      title="YouTube player"
    />
  );
}
