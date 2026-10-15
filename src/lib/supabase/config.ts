/** Supabase is optional until the env vars are set; the app runs read-only without it. */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const supabaseEnabled = Boolean(supabaseUrl && supabaseKey);

/** Comma-separated list of Google accounts allowed in. Empty = anyone who signs in. */
export const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
