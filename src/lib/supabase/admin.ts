import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/supabase/config";

/**
 * Server-only client with the Supabase secret key (env SUPABASE_SECRET_KEY, never sent to the browser).
 * Used only to deliver notifications and reminders to everyone. Returns null when the key isn't set,
 * and those features then quietly fall back to what works without it.
 */
let cached: SupabaseClient | null | undefined;
export function adminClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const key = process.env.SUPABASE_SECRET_KEY;
  cached = supabaseUrl && key ? createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return cached;
}
