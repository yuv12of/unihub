import { connection } from "next/server";
import { anonClient, bearer } from "@/lib/privateFeed";
import { isOpalExportUrl, opalToEvents, parseIcs } from "@/lib/icsParse";
import { todayInIsrael } from "@/lib/semester";

/**
 * Called every hour by the user's Apps Script. Reads the user's Opal calendar through its private
 * export link and replaces the Opal events in Unihub. No password and no AI involved.
 */
export async function POST(req: Request) {
  await connection();
  const token = bearer(req);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sb = anonClient();
  const { data: url, error } = await sb.rpc("opal_feed_url", { p_token: token });
  if (error) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!url) return Response.json({ opal: "not connected" });
  if (!isOpalExportUrl(url as string)) {
    await sb.rpc("opal_replace", { p_token: token, p_events: null, p_status: "הקישור אינו קישור יצוא של אופל" });
    return Response.json({ opal: "bad url" });
  }

  let text: string;
  try {
    const res = await fetch(url as string, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    text = await res.text();
    if (!res.ok || !text.includes("BEGIN:VCALENDAR")) throw new Error(`Opal answered ${res.status}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch failed";
    // Keep the previous events; just record the problem (Opal is sometimes down for maintenance).
    await sb.rpc("opal_replace", { p_token: token, p_events: null, p_status: `שגיאה: ${msg}`.slice(0, 300) });
    return Response.json({ opal: "error", message: msg });
  }

  const events = opalToEvents(parseIcs(text), todayInIsrael());
  const { data: n } = await sb.rpc("opal_replace", { p_token: token, p_events: events, p_status: "ok" });
  return Response.json({ opal: "ok", events: n });
}
