import { connection } from "next/server";
import { cookies, headers } from "next/headers";
import { SpotifyError, spotifyApi, spotifyEnabled, tokenRequest } from "@/lib/spotify";
import { createClient } from "@/lib/supabase/server";

/** Spotify sends the user back here after they approve; the tokens are stored for this user only. */
export async function GET(req: Request) {
  await connection();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const back = (r: string) => Response.redirect(`${origin}/profile?spotify=${r}#music`);
  const url = new URL(req.url);
  const jar = await cookies();
  const verifier = jar.get("sp_v")?.value;
  const state = jar.get("sp_s")?.value;
  jar.delete({ name: "sp_v", path: "/api/spotify" });
  jar.delete({ name: "sp_s", path: "/api/spotify" });
  if (!spotifyEnabled) return back("off");
  if (url.searchParams.get("error")) return back("denied");
  const code = url.searchParams.get("code");
  if (!code || !verifier || !state || url.searchParams.get("state") !== state) return back("error");

  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return Response.redirect(`${origin}/login`);
  try {
    const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: `${origin}/api/spotify/callback`, code_verifier: verifier });
    let me: { display_name?: string; id: string } | null = null;
    try {
      me = await spotifyApi<{ display_name?: string; id: string }>(t.access_token, "/me");
    } catch (e) {
      // Development mode: users who aren't on the app's list get 403 on every call.
      if (e instanceof SpotifyError && e.status === 403) return back("notallowed");
    }
    const { error } = await sb.from("spotify_tokens").upsert({
      user_id: userId,
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? "",
      expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      spotify_name: me?.display_name ?? me?.id ?? null,
      updated_at: new Date().toISOString(),
    });
    return back(error ? "error" : "ok");
  } catch {
    return back("error");
  }
}
