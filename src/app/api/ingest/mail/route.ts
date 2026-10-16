import { connection } from "next/server";
import { supabaseEnabled } from "@/lib/supabase/config";
import { anonClient, bearer, loadPrivate } from "@/lib/privateFeed";
import { runMailRules } from "@/lib/mailRules";
import { sendPush } from "@/lib/push";
import { todayInIsrael } from "@/lib/semester";

/**
 * Receives university mail from the user's Google Apps Script.
 * The bearer token identifies the user; the database function only accepts openu.ac.il senders.
 * Then plain rules run on it: routine mail gets its summary here (no AI needed), and mail that
 * changes the schedule (extensions, cancelled tutorials, grades) becomes an update + a notification.
 */
export async function POST(req: Request) {
  await connection();
  if (!supabaseEnabled) return Response.json({ error: "not configured" }, { status: 503 });
  const token = bearer(req);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });

  let mail: unknown;
  try {
    mail = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const m = mail as Record<string, unknown>;
  if (typeof m.id !== "string" || typeof m.date !== "string" || typeof m.sender !== "string")
    return Response.json({ error: "missing fields" }, { status: 400 });

  const sb = anonClient();
  const { data, error } = await sb.rpc("ingest_mail", { p_token: token, p_mail: m });
  if (error) return Response.json({ error: "rejected" }, { status: error.message.includes("token") ? 401 : 400 });
  if (data === "ignored") return Response.json({ result: data });

  const priv = await loadPrivate(token);
  const attachments = Array.isArray(m.attachments)
    ? (m.attachments as { name?: unknown; text?: unknown }[]).map((a) => ({
        name: String(a.name ?? ""),
        text: typeof a.text === "string" ? a.text : "",
      }))
    : [];
  const rules = runMailRules(
    {
      subject: String(m.subject ?? ""),
      sender: m.sender,
      body: String(m.body ?? ""),
      date: m.date,
      attachments,
    },
    priv?.feed.events ?? [],
    todayInIsrael(),
    priv?.courses ?? [],
  );
  const { data: created } = await sb.rpc("mail_rules_apply", {
    p_token: token,
    p_gmail_id: m.id,
    p_category: rules.category,
    p_summary: rules.summary,
    p_actions: rules.actions,
    p_updates: rules.updates,
  });

  const fresh = (created ?? []) as { id: string; title: string }[];
  if (fresh.length && priv)
    await sendPush(
      token,
      priv.feed.subscriptions,
      fresh.map((u) => ({ key: `u|${u.id}`, title: u.title, body: "עדכון מהדואר של האוניברסיטה", url: "/" })),
    );

  return Response.json({ result: data, rules: rules.category ?? "ai", updates: fresh.length });
}
