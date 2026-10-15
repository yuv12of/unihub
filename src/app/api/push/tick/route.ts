import { connection } from "next/server";
import webpush from "web-push";
import { anonClient, bearer, israelNow, loadPrivate } from "@/lib/privateFeed";
import { progressKey } from "@/lib/progress";
import { addDays, allDeadlines, courseTheme, typeLabel } from "@/lib/semester";

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * Called every 10 minutes by the user's Apps Script. Sends reminders that fall in the next window:
 * study sessions and tutorials ~15 minutes ahead, and tomorrow's deadlines at 20:00.
 */
export async function POST(req: Request) {
  await connection();
  const token = bearer(req);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  const data = await loadPrivate(token);
  if (!data) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { feed, sessions, progress } = data;
  if (feed.subscriptions.length === 0) return Response.json({ sent: 0, reason: "no subscriptions" });

  const now = israelNow();
  const inWindow = (start: string) => {
    const diff = toMin(start) - now.minutes;
    return diff > 0 && diff <= 20;
  };

  const due: { key: string; title: string; body: string; url: string }[] = [];
  for (const s of sessions.filter((x) => x.date === now.date && inWindow(x.start)))
    due.push({ key: `s|${s.date}|${s.start}|${s.title}`, title: `${s.start} · ${s.title}`, body: `מפגש לימוד עד ${s.end}`, url: "/" });
  for (const e of feed.events.filter((x) => x.date === now.date && x.start_time && x.kind !== "other" && inWindow(x.start_time)))
    due.push({
      key: `e|${e.id}`,
      title: `${e.start_time} · ${e.title}${e.course_code ? ` ב${courseTheme[e.course_code]?.short ?? ""}` : ""}`,
      body: e.location ?? "מתחיל בעוד כמה דקות",
      url: "/semester",
    });
  if (now.minutes >= 20 * 60 && now.minutes < 20 * 60 + 30) {
    const tomorrow = addDays(now.date, 1);
    for (const d of allDeadlines(now.date).filter((x) => x.due === tomorrow)) {
      const st = progress[progressKey(d.course.code, d.n)]?.status;
      if (st === "submitted" || st === "skipped") continue;
      due.push({
        key: `d|${d.course.code}|${d.n}|${d.due}`,
        title: `מחר: ${typeLabel[d.type]} ${d.n} ב${courseTheme[d.course.code].short}`,
        body: "תזכורת להגשה. סמנו ב־Unihub כשהוגש.",
        url: "/courses",
      });
    }
  }
  if (due.length === 0) return Response.json({ sent: 0 });

  const sb = anonClient();
  const [{ data: pub }, { data: priv }] = await Promise.all([
    sb.rpc("vapid_public"),
    sb.rpc("vapid_private", { p_token: token }),
  ]);
  if (!pub || !priv) return Response.json({ sent: 0, reason: "push keys not initialised" });
  webpush.setVapidDetails("https://unihub-beta.vercel.app", pub as string, priv as string);

  let sent = 0;
  for (const n of due) {
    const { data: fresh } = await sb.rpc("push_mark", { p_token: token, p_key: n.key });
    if (!fresh) continue; // already sent
    for (const s of feed.subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.key }),
          { TTL: 1800 },
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.rpc("push_mark", { p_token: token, p_key: "", p_dead_endpoint: s.endpoint });
      }
    }
  }
  return Response.json({ sent });
}
