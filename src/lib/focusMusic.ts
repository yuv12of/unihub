/** Spotify focus playlists (checked against Spotify). Users can also paste any playlist link. */
export const FOCUS_PLAYLISTS = [
  { id: "37i9dQZF1DWZeKCadgRdKQ", name: "Deep Focus", emoji: "🧠" },
  { id: "37i9dQZF1DWWQRwui0ExPn", name: "lofi beats", emoji: "🎧" },
  { id: "0vvXsWCC9xrXsKd4FyS8kM", name: "Lofi Girl", emoji: "📻" },
  { id: "37i9dQZF1DX4sWSpwq3LiO", name: "Peaceful Piano", emoji: "🎹" },
  { id: "37i9dQZF1DX3TPMgP3ojGS", name: "Coffee and Piano", emoji: "☕" },
  { id: "37i9dQZF1DX6iSJxWbeWLf", name: "Hyper Focus Noise", emoji: "🌊" },
  { id: "37i9dQZF1DXcscxvxm7Pfv", name: "Noise Canceling", emoji: "🔇" },
] as const;

/** Accepts a playlist id, an open.spotify.com link or a spotify: URI. */
export function playlistId(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = input.match(/playlist[/:]([A-Za-z0-9]{22})/) ?? input.match(/^([A-Za-z0-9]{22})$/);
  return m ? m[1] : null;
}

export const playlistUrl = (id: string) => `https://open.spotify.com/playlist/${id}`;
export const embedUrl = (id: string) => `https://open.spotify.com/embed/playlist/${id}?utm_source=generator&theme=0`;
