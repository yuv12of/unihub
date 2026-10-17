import { connection } from "next/server";
import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { SPOTIFY_SCOPES, spotifyClientId, spotifyEnabled } from "@/lib/spotify";
import { createClient } from "@/lib/supabase/server";

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Starts "Connect Spotify": PKCE sign-in, no client secret involved. */
export async function GET() {
  await connection();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  if (!spotifyEnabled) return Response.redirect(`${origin}/profile?spotify=off#music`);
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  if (!data?.claims?.sub) return Response.redirect(`${origin}/login`);

  const verifier = b64url(randomBytes(48));
  const state = b64url(randomBytes(16));
  const jar = await cookies();
  const opts = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/api/spotify", maxAge: 600 };
  jar.set("sp_v", verifier, opts);
  jar.set("sp_s", state, opts);
  const q = new URLSearchParams({
    client_id: spotifyClientId,
    response_type: "code",
    redirect_uri: `${origin}/api/spotify/callback`,
    code_challenge_method: "S256",
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    scope: SPOTIFY_SCOPES,
    state,
  });
  return Response.redirect(`https://accounts.spotify.com/authorize?${q}`);
}
