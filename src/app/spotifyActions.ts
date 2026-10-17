"use server";

import { createClient } from "@/lib/supabase/server";
import { accessToken, playerState, SpotifyError, spotifyApi, spotifyEnabled, type SpotifyState } from "@/lib/spotify";

async function me() {
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) throw new Error("Not signed in");
  const { data: profile } = await sb.from("profiles").select("status").maybeSingle();
  if (profile?.status !== "approved") throw new Error("החשבון עוד לא אושר");
  return { sb, userId };
}

/** What's playing, on which device, for the signed-in user. */
export async function spotifyNow(): Promise<SpotifyState> {
  if (!spotifyEnabled) return { enabled: false, connected: false };
  const { sb, userId } = await me();
  const token = await accessToken(sb, userId);
  if (!token) return { enabled: true, connected: false };
  const { data } = await sb.from("spotify_tokens").select("spotify_name").eq("user_id", userId).maybeSingle();
  try {
    return { enabled: true, connected: true, name: data?.spotify_name, ...(await playerState(token)) };
  } catch (e) {
    return { enabled: true, connected: true, name: data?.spotify_name, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export type SpotifyCommand =
  | { cmd: "play"; playlist?: string | null; device?: string | null }
  | { cmd: "pause" }
  | { cmd: "next" }
  | { cmd: "previous" }
  | { cmd: "volume"; value: number }
  | { cmd: "shuffle"; value: boolean }
  | { cmd: "transfer"; device: string };

/** One playback command. Returns an error message instead of throwing, so the timer never breaks. */
export async function spotifyDo(c: SpotifyCommand): Promise<{ ok: boolean; error?: string }> {
  if (!spotifyEnabled) return { ok: false, error: "Spotify לא מוגדר" };
  const { sb, userId } = await me();
  const token = await accessToken(sb, userId);
  if (!token) return { ok: false, error: "Spotify לא מחובר" };
  const dev = (id?: string | null) => (id && /^[\w-]{10,64}$/.test(id) ? `?device_id=${id}` : "");
  try {
    switch (c.cmd) {
      case "play": {
        const id = c.playlist && /^[A-Za-z0-9]{22}$/.test(c.playlist) ? c.playlist : null;
        await spotifyApi(token, `/me/player/play${dev(c.device)}`, { method: "PUT", body: id ? JSON.stringify({ context_uri: `spotify:playlist:${id}` }) : undefined });
        break;
      }
      case "pause":
        await spotifyApi(token, "/me/player/pause", { method: "PUT" });
        break;
      case "next":
        await spotifyApi(token, "/me/player/next", { method: "POST" });
        break;
      case "previous":
        await spotifyApi(token, "/me/player/previous", { method: "POST" });
        break;
      case "volume":
        await spotifyApi(token, `/me/player/volume?volume_percent=${Math.max(0, Math.min(100, Math.round(c.value)))}`, { method: "PUT" });
        break;
      case "shuffle":
        await spotifyApi(token, `/me/player/shuffle?state=${c.value ? "true" : "false"}`, { method: "PUT" });
        break;
      case "transfer":
        if (!/^[\w-]{10,64}$/.test(c.device)) return { ok: false, error: "מכשיר לא תקין" };
        await spotifyApi(token, "/me/player", { method: "PUT", body: JSON.stringify({ device_ids: [c.device], play: true }) });
        break;
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof SpotifyError || e instanceof Error ? e.message : "שגיאה" };
  }
}

/** The user's own playlists, for the picker. */
export async function spotifyPlaylists(): Promise<{ id: string; name: string; image: string | null }[]> {
  if (!spotifyEnabled) return [];
  const { sb, userId } = await me();
  const token = await accessToken(sb, userId);
  if (!token) return [];
  try {
    const r = await spotifyApi<{ items: { id: string; name: string; images?: { url: string }[] | null }[] }>(token, "/me/playlists?limit=30");
    return (r?.items ?? []).filter((p) => p?.id).map((p) => ({ id: p.id, name: p.name, image: p.images?.at(-1)?.url ?? null }));
  } catch {
    return [];
  }
}

export async function spotifyDisconnect() {
  const { sb, userId } = await me();
  await sb.from("spotify_tokens").delete().eq("user_id", userId);
}
