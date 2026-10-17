/**
 * Spotify control (server only). Each user signs in once with Spotify (PKCE, no client secret);
 * tokens are kept in spotify_tokens (owner-only rows) and refreshed here.
 * Playback commands need Spotify Premium and an open Spotify app on some device.
 * Setup: a Spotify developer app, its Client ID in env SPOTIFY_CLIENT_ID, redirect URI
 * <site>/api/spotify/callback, and each user added under User Management (development mode).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const spotifyClientId = process.env.SPOTIFY_CLIENT_ID ?? "";
export const spotifyEnabled = /^[0-9a-f]{32}$/i.test(spotifyClientId);
export const SPOTIFY_SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

export class SpotifyError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

interface TokenRow {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  spotify_name: string | null;
}

export async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: spotifyClientId, ...body }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new SpotifyError(json.error_description ?? json.error ?? `Spotify ${res.status}`, res.status);
  return json as { access_token: string; refresh_token?: string; expires_in: number };
}

/** A fresh access token for the signed-in user, or null when Spotify isn't connected. */
export async function accessToken(sb: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await sb.from("spotify_tokens").select("access_token, refresh_token, expires_at, spotify_name").eq("user_id", userId).maybeSingle<TokenRow>();
  if (!data) return null;
  if (Date.parse(data.expires_at) - Date.now() > 60_000) return data.access_token;
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token });
    await sb
      .from("spotify_tokens")
      .update({
        access_token: t.access_token,
        refresh_token: t.refresh_token ?? data.refresh_token,
        expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return t.access_token;
  } catch (e) {
    // Revoked in Spotify's settings: forget it so the app offers to connect again.
    if (e instanceof SpotifyError && e.status === 400) await sb.from("spotify_tokens").delete().eq("user_id", userId);
    return null;
  }
}

const REASONS: Record<string, string> = {
  NO_ACTIVE_DEVICE: "אין מכשיר פעיל. פתחו את Spotify בטלפון או במחשב ונסו שוב.",
  PREMIUM_REQUIRED: "שליטה בנגינה דורשת Spotify Premium.",
};

export async function spotifyApi<T = unknown>(token: string, path: string, init: RequestInit = {}): Promise<T | null> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    cache: "no-store",
  });
  if (res.status === 204 || res.status === 202) return null;
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const reason = json?.error?.reason as string | undefined;
    const msg = (reason && REASONS[reason]) || (res.status === 403 ? REASONS.PREMIUM_REQUIRED : res.status === 404 ? REASONS.NO_ACTIVE_DEVICE : json?.error?.message) || `Spotify ${res.status}`;
    throw new SpotifyError(msg, res.status);
  }
  return json as T;
}

export interface SpotifyState {
  enabled: boolean;
  connected: boolean;
  name?: string | null;
  playing?: {
    title: string;
    artist: string;
    image: string | null;
    isPlaying: boolean;
    progress: number;
    duration: number;
    url: string | null;
    context: string | null;
  } | null;
  device?: { id: string; name: string; volume: number | null } | null;
  devices?: { id: string; name: string; type: string; active: boolean }[];
  shuffle?: boolean;
  error?: string;
}

interface PlayerJson {
  is_playing: boolean;
  progress_ms: number | null;
  shuffle_state?: boolean;
  device?: { id: string; name: string; volume_percent: number | null };
  context?: { uri: string } | null;
  item?: {
    name: string;
    duration_ms: number;
    external_urls?: { spotify?: string };
    artists?: { name: string }[];
    album?: { images?: { url: string; width: number }[] };
    show?: { name: string; images?: { url: string }[] };
    images?: { url: string }[];
  } | null;
}

export async function playerState(token: string): Promise<Omit<SpotifyState, "enabled" | "connected">> {
  const [p, d] = await Promise.all([
    spotifyApi<PlayerJson>(token, "/me/player?additional_types=episode"),
    spotifyApi<{ devices: { id: string; name: string; type: string; is_active: boolean }[] }>(token, "/me/player/devices"),
  ]);
  const item = p?.item;
  const images = item?.album?.images ?? item?.images ?? item?.show?.images ?? [];
  return {
    playing: item
      ? {
          title: item.name,
          artist: item.artists?.map((a) => a.name).join(", ") ?? item.show?.name ?? "",
          image: (images[1] ?? images[0])?.url ?? null, // Spotify lists 640, 300, 64 px
          isPlaying: p!.is_playing,
          progress: p!.progress_ms ?? 0,
          duration: item.duration_ms,
          url: item.external_urls?.spotify ?? null,
          context: p?.context?.uri ?? null,
        }
      : null,
    device: p?.device ? { id: p.device.id, name: p.device.name, volume: p.device.volume_percent } : null,
    devices: (d?.devices ?? []).filter((x) => x.id).map((x) => ({ id: x.id, name: x.name, type: x.type, active: x.is_active })),
    shuffle: p?.shuffle_state,
  };
}
