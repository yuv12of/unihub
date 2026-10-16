import { connection } from "next/server";
import { bearer, israelNow, loadPrivate } from "@/lib/privateFeed";
import { sendPush, type PushItem } from "@/lib/push";
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
  const { feed, sessions, progress, courses } = data;
  if (feed.subscriptions.length === 0) return Response.json({ sent: 0, reason: "no subscriptions" });

  const now = israelNow();
  const inWindow = (start: string) => {
    const diff = toMin(start) - now.minutes;
    return diff > 0 && diff <= 20;
  };

  const due: PushItem[] = [];
  for (const s of sessions.filter((x) => x.date === now.date && inWindow(x.start)))
    due.push({ key: `s|${s.date}|${s.start}|${s.title}`, title: `${s.start} · ${s.title}`, body: `מפגש לימוד עד ${s.end}`, url: "/" });
  for (const e of feed.events.filter((x) => x.date === now.date && x.start_time && x.kind !== "other" && !x.cancelled && inWindow(x.start_time)))
    due.push({
      key: `e|${e.id}`,
      title: `${e.start_time} · ${e.title}${e.course_code ? ` ב${courseTheme[e.course_code]?.short ?? ""}` : ""}`,
      body: e.location ?? "מתחיל בעוד כמה דקות",
      url: "/semester",
    });
  if (now.minutes >= 20 * 60 && now.minutes < 20 * 60 + 30) {
    const tomorrow = addDays(now.date, 1);
    for (const d of allDeadlines(now.date, courses).filter((x) => x.due === tomorrow)) {
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
  return Response.json({ sent: await sendPush(token, feed.subscriptions, due) });
}
