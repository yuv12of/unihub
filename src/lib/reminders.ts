/** Which phone reminders are due right now for one user. Pure: the tick route decides who and sends. */
import type { PushItem } from "@/lib/push";
import type { buildFromFeed } from "@/lib/privateFeed";
import { occurrencesFor } from "@/lib/planfor";
import { sessionKey } from "@/lib/planner";
import { progressKey } from "@/lib/progress";
import { addDays, allDeadlines, typeLabel, themeOf } from "@/lib/semester";

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const WRAP_UP_AT = 22 * 60;

export function remindersFor(data: ReturnType<typeof buildFromFeed>, now: { date: string; minutes: number }): PushItem[] {
  const { feed, sessions, progress, courses, routines, logs, plan, offDays } = data;
  if (offDays.includes(now.date)) return []; // rough day: leave them alone
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
      title: `${e.start_time} · ${e.title}${e.course_code ? ` ב${themeOf(courses, e.course_code).short}` : ""}`,
      body: e.location ?? "מתחיל בעוד כמה דקות",
      url: "/semester",
    });
  const todayRoutines = occurrencesFor({ routines, logs, events: feed.events, plan, today: now.date, from: now.date, to: now.date, offDays });
  for (const o of todayRoutines)
    if (o.start && !o.done && o.category !== "sleep" && o.category !== "meal" && inWindow(o.start))
      due.push({ key: `r|${o.routineId}|${o.date}`, title: `${o.start} · ${o.emoji} ${o.title}`, body: `עד ${o.end}`, url: "/routines" });

  if (now.minutes >= 20 * 60 && now.minutes < 20 * 60 + 30) {
    const tomorrow = addDays(now.date, 1);
    for (const d of allDeadlines(now.date, courses).filter((x) => x.due === tomorrow)) {
      const st = progress[progressKey(d.course.code, d.n)]?.status;
      if (st === "submitted" || st === "skipped") continue;
      due.push({
        key: `d|${d.course.code}|${d.n}|${d.due}`,
        title: `מחר: ${typeLabel[d.type]} ${d.n} ב${themeOf(courses, d.course.code).short}`,
        body: "תזכורת להגשה. סמנו ב־Unihub כשהוגש.",
        url: "/courses",
      });
    }
  }

  // 21:00: a look at tomorrow (first study session and first event), so nothing surprises you.
  if (now.minutes >= 21 * 60 && now.minutes < 21 * 60 + 30) {
    const tomorrow = addDays(now.date, 1);
    if (!offDays.includes(tomorrow)) {
      const first = plan.sessions.find((x) => x.date === tomorrow);
      const ev = feed.events
        .filter((x) => x.date === tomorrow && x.start_time && !x.cancelled && x.kind !== "other")
        .sort((a, b) => a.start_time!.localeCompare(b.start_time!))[0];
      const count = plan.sessions.filter((x) => x.date === tomorrow).length;
      const parts = [
        ev ? `${ev.start_time} ${ev.title}` : "",
        first ? `${first.start} ${first.title}${count > 1 ? ` (+${count - 1})` : ""}` : "",
      ].filter(Boolean);
      if (parts.length)
        due.push({ key: `tmr|${tomorrow}`, title: "מחר אצלך 🗓️", body: `${parts.join(" · ")}. רוצה להזיז משהו?`, url: "/semester" });
    }
  }

  // Evening wrap-up: what's still unticked today.
  if (now.minutes >= WRAP_UP_AT && now.minutes < WRAP_UP_AT + 30) {
    const studyLeft = plan.sessions.filter((s) => s.date === now.date && !feed.session_status[sessionKey(s)]).length;
    const routinesLeft = todayRoutines.filter((o) => !o.done && o.category !== "sleep" && o.category !== "meal").length;
    if (studyLeft + routinesLeft > 0) {
      const parts = [
        studyLeft ? (studyLeft === 1 ? "מפגש לימוד אחד" : `${studyLeft} מפגשי לימוד`) : "",
        routinesLeft ? (routinesLeft === 1 ? "שגרה אחת" : `${routinesLeft} שגרות`) : "",
      ].filter(Boolean);
      due.push({
        key: `wrap|${now.date}`,
        title: "סיכום היום 🌙",
        body: `${parts.join(" ו")} עוד לא סומנו. מה הספקת?`,
        url: "/?wrap=1",
      });
    }
  }
  return due;
}
