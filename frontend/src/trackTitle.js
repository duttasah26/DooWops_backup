// "Song - Artist, Artist" for player title bars.
export function trackTitle(track) {
  return track ? `${track.name} - ${track.artists.map(a => a.name).join(", ")}` : "now playing";
}
