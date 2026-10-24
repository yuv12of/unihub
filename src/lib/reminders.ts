/** Which phone reminders are due right now for one user. Pure: the tick route decides who and sends. */
import type { PushItem } from "@/lib/push";
import type { buildFromFeed } from "@/lib/privateFeed";
import { occurrencesFor } from "@/lib/planfor";
import { sleepInFor } from "@/lib/sleepIn";
import { sessionKey } from "@/lib/planner";
import { progressKey } from "@/lib/progress";
import { addDays, allDeadlines, typeLabel, themeOf } from "@/lib/semester";
import { weekStart } from "@/lib/routines";
import { evaluateIfThen, ifThenPush, type IfThenPlan, type TriggerContext } from "@/lib/ifthen";
import { range } from "@/lib/time";

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** One evening push (replaces the 21:00 "tomorrow" and 22:00 wrap-up pushes): today's leftovers + tomorrow. */
export const EVENING_AT = 21 * 60 + 30;
/** The Saturday routine where if-then plans are written. */
const WEEK_PLANNING = /תכנון (ה)?שבוע/;

/** What the tick loads beyond the private feed (table if_then, study_live). */
export interface ReminderExtras {
  ifThen?: IfThenPlan[];
  /** study_live.started_at of a running focus timer, if any */
  liveStartedAt?: string | null;
}

export function remindersFor(data: ReturnType<typeof buildFromFeed>, now: { date: string; minutes: number }, extras: ReminderExtras = {}): PushItem[] {
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
      due.push({
        key: `r|${o.routineId}|${o.date}`,
        title: `${o.start} · ${o.emoji} ${o.title}`,
        body: WEEK_PLANNING.test(o.title) ? `עד ${o.end}. כולל 2–3 תוכניות אם–אז לשבוע.` : `עד ${o.end}`,
        url: WEEK_PLANNING.test(o.title) ? "/routines/plans" : "/routines",
      });

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

  // ~21:30: one evening push — what's still open today, tomorrow's first thing, and the sleep-in offer.
  if (now.minutes >= EVENING_AT && now.minutes < EVENING_AT + 30) {
    const e = eveningPush(data, now, todayRoutines);
    if (e) due.push(e);
  }

  // If-then plans: the user's own fallback, quoted, once a day each.
  if (extras.ifThen?.length) for (const f of evaluateIfThen(extras.ifThen, triggerContext(data, now, todayRoutines, extras))) due.push(ifThenPush(f));
  return due;
}

type Routines = ReturnType<typeof occurrencesFor>;

function eveningPush(data: ReturnType<typeof buildFromFeed>, now: { date: string; minutes: number }, todayRoutines: Routines): PushItem | null {
  const { feed, plan, routines, offDays, courses } = data;
  const studyLeft = plan.sessions.filter((s) => s.date === now.date && !feed.session_status[sessionKey(s)]).length;
  const routinesLeft = todayRoutines.filter((o) => !o.done && o.category !== "sleep" && o.category !== "meal" && (!o.start || toMin(o.start) < now.minutes)).length;
  const left = [
    studyLeft ? (studyLeft === 1 ? "מפגש לימוד אחד" : `${studyLeft} מפגשי לימוד`) : "",
    routinesLeft ? (routinesLeft === 1 ? "שגרה אחת" : `${routinesLeft} שגרות`) : "",
  ].filter(Boolean);
  const today = left.length ? `היום: ${left.join(" ו")} עוד לא סומנו.` : "";

  const tomorrow = addDays(now.date, 1);
  let next = "";
  let sleep: ReturnType<typeof sleepInFor> = null;
  if (!offDays.includes(tomorrow)) {
    const first = plan.sessions.find((x) => x.date === tomorrow);
    const ev = feed.events
      .filter((x) => x.date === tomorrow && x.start_time && !x.cancelled && x.kind !== "other")
      .sort((a, b) => a.start_time!.localeCompare(b.start_time!))[0];
    const firstThing = ev && (!first || ev.start_time! <= first.start) ? `${range(ev.start_time)} ${ev.title}` : first ? `${range(first.start)} ${first.title}` : "";
    if (firstThing) next = `מחר מתחילים ב־${firstThing}.`;
    sleep = sleepInFor({ today: now.date, routines, plan, events: feed.events, courses, exams: data.exams ?? [], offDays });
  }
  if (sleep && !sleep.accepted)
    return {
      key: `eve|${now.date}`,
      title: "מחר אפשר לישון שעה יותר",
      body: [`${sleep.reason}. ההשכמה יכולה לזוז ל־${range(sleep.until)}.`, today, "לאשר ב־Unihub."].filter(Boolean).join(" "),
      url: "/",
    };
  if (!today && !next) return null;
  return {
    key: `eve|${now.date}`,
    title: left.length ? "סיכום היום ומחר" : "מחר אצלך",
    body: [today, next, left.length ? "מה הספקת?" : ""].filter(Boolean).join(" "),
    url: "/",
  };
}

/** Everything the if-then triggers look at, from the same feed the other reminders use. */
export function triggerContext(data: ReturnType<typeof buildFromFeed>, now: { date: string; minutes: number }, todayRoutines: Routines, extras: ReminderExtras): TriggerContext {
  const { feed, sessions, plan } = data;
  const status = feed.session_status;
  const doneMinutes = (pred: (date: string) => boolean) =>
    Object.entries(status).reduce((n, [k, st]) => (st === "done" && pred(k.slice(0, 10)) ? n + Math.max(1, feed.session_minutes?.[k] ?? 0) : n), 0);
  const ws = weekStart(now.date);
  const we = addDays(ws, 6);
  let liveStartedAt: number | null = null;
  if (extras.liveStartedAt) {
    const t = new Date(extras.liveStartedAt);
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(t);
    const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "0";
    const date = `${get("year")}-${get("month")}-${get("day")}`;
    liveStartedAt = date === now.date ? (Number(get("hour")) % 24) * 60 + Number(get("minute")) : 0;
  }
  return {
    date: now.date,
    minutes: now.minutes,
    weekday: new Date(now.date + "T00:00:00Z").getUTCDay(),
    sessions: sessions.filter((s) => s.date === now.date).map((s) => ({ key: sessionKey(s), start: s.start, end: s.end, title: s.title, status: status[sessionKey(s)] })),
    liveStartedAt,
    studiedToday: doneMinutes((d) => d === now.date),
    routines: todayRoutines.map((o) => ({ routineId: o.routineId, title: o.title, start: o.start, end: o.end, done: o.done })),
    week: {
      goal: feed.prefs?.weekly_goal_minutes ?? null,
      done: doneMinutes((d) => d >= ws && d <= now.date),
      planned: plan.sessions
        .filter((s) => s.date >= now.date && s.date <= we && !status[sessionKey(s)] && (s.date > now.date || toMin(s.end) > now.minutes))
        .reduce((n, s) => n + s.minutes, 0),
    },
  };
}
