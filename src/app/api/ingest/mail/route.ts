import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnabled, supabaseKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Receives university mail from the user's Google Apps Script.
 * The bearer token identifies the user; the database function only accepts openu.ac.il senders.
 */
export async function POST(req: Request) {
  await connection();
  if (!supabaseEnabled) return Response.json({ error: "not configured" }, { status: 503 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!/^[0-9a-f]{48}$/.test(token)) return Response.json({ error: "unauthorized" }, { status: 401 });

  let mail: unknown;
  try {
    mail = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const m = mail as Record<string, unknown>;
  if (typeof m.id !== "string" || typeof m.date !== "string" || typeof m.sender !== "string")
    return Response.json({ error: "missing fields" }, { status: 400 });

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("ingest_mail", { p_token: token, p_mail: m });
  if (error) return Response.json({ error: "rejected" }, { status: error.message.includes("token") ? 401 : 400 });
  return Response.json({ result: data });
}
