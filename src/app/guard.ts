import "server-only";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnabled } from "@/lib/supabase/config";

/**
 * The one wrapper every server action runs through:
 * - signed in AND approved (profiles.status = 'approved'), else a Hebrew { failed };
 * - any error becomes { failed: "<message>" } (in production the text of a thrown error never
 *   reaches the browser, only a coded React error does); "@/app/act" turns it back into an Error;
 * - the error is logged on the server with the action's name.
 * redirect() / notFound() still pass through.
 */
export type Failed = { failed: string };

export type ActionCtx = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  isAdmin: boolean;
};

class Refused extends Error {}

async function signedIn(): Promise<ActionCtx> {
  if (!supabaseEnabled) throw new Refused("לא מחובר");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) throw new Refused("צריך להתחבר מחדש");
  const { data: profile, error } = await supabase.from("profiles").select("status, is_admin").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (profile?.status !== "approved") throw new Refused("החשבון עוד לא אושר");
  return { supabase, userId, isAdmin: !!profile.is_admin };
}

export async function action<T>(name: string, fn: (ctx: ActionCtx) => Promise<T>): Promise<T | Failed> {
  try {
    return await fn(await signedIn());
  } catch (e) {
    const digest = (e as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw e; // redirect / notFound
    if (!(e instanceof Refused)) console.error(`[action ${name}]`, e);
    return { failed: e instanceof Error && e.message ? e.message : "משהו השתבש, נסו שוב" };
  }
}

/** Throws on a Supabase error, so ignored write errors still reach the user. */
export function must<R extends { error: { message: string } | null }>(res: R): R {
  if (res.error) throw new Error(res.error.message);
  return res;
}
