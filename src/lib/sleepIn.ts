/**
 * "Sleep in tomorrow": on a night after a late evening (a tutorial till 20:00 or later), with no
 * deadline or exam close and a light morning, suggest an extra hour of sleep. Accepting adds a
 * "שינה מאוחרת" event over the first hour; morning routines in that hour move later, and the
 * study plan works around both. Pure, so Today, the 21:00 push and the plan agree.
 */
import type { Busy, Exam, Plan } from "@/lib/planner";
import type { Occurrence, Routine } from "@/lib/routines";
import { awakeWindow, toHHMM, toMin } from "@/lib/routines";
import { addDays, type Course } from "@/lib/semester";

export const SLEEP_IN_TITLE = "שינה מאוחרת";
export const SLEEP_IN_MINUTES = 60;

interface Ev {
  date: string;
  start_time: string | null;
  end_time: string | null;
  kind: string;
  cancelled?: boolean;
  title?: string;
  source?: string;
}

const isSleepIn = (e: Ev) => e.title === SLEEP_IN_TITLE && (e.source ?? "manual") === "manual" && !!e.start_time && !!e.end_time && !e.cancelled;

/** Accepted sleep-ins by date: [from, to) in minutes. */
export function sleepInShifts(events: Ev[]): Map<string, [number, number]> {
  const m = new Map<string, [number, number]>();
  for (const e of events) if (isSleepIn(e)) m.set(e.date, [toMin(e.start_time!), toMin(e.end_time!)]);
  return m;
}

/** Moves fixed routine time that starts inside a sleep-in to right after it (planner busy). */
export function shiftBusy(busy: Busy[], shifts: Map<string, [number, number]>): Busy[] {
  if (!shifts.size) return busy;
  return busy.map((b) => {
    const s = shifts.get(b.date);
    const st = toMin(b.start);
    if (!s || st < s[0] || st >= s[1]) return b;
    const by = s[1] - s[0];
    return { ...b, start: toHHMM(st + by), end: toHHMM(Math.min(toMin(b.end) + by, 1439)) };
  });
}

/** The same for routine occurrences shown in the app (wake-up, breakfast…). */
export function shiftOccurrences(occ: Occurrence[], shifts: Map<string, [number, number]>): Occurrence[] {
  if (!shifts.size) return occ;
  return occ.map((o) => {
    const s = shifts.get(o.date);
    if (!s || !o.start || o.flexible || o.category === "sleep") return o;
    const st = toMin(o.start);
    if (st < s[0] || st >= s[1]) return o;
    const by = s[1] - s[0];
    return { ...o, start: toHHMM(st + by), end: o.end ? toHHMM(Math.min(toMin(o.end) + by, 1439)) : o.end };
  });
}

export interface SleepIn {
  date: string; // tomorrow
  from: string; // usual wake-up
  until: string; // wake-up with the extra hour
  accepted: boolean;
  reason: string;
}

/** Tomorrow's sleep-in, if tonight earns one (or it was already accepted). */
export function sleepInFor({
  today,
  routines,
  plan,
  events,
  courses,
  exams,
  offDays = [],
}: {
  today: string;
  routines: Routine[];
  plan: Plan;
  events: Ev[];
  courses: Course[];
  exams: Exam[];
  offDays?: string[];
}): SleepIn | null {
  const tomorrow = addDays(today, 1);
  const { wake } = awakeWindow(routines);
  const from = toHHMM(wake);
  const until = toHHMM(wake + SLEEP_IN_MINUTES);
  const accepted = events.find((e) => e.date === tomorrow && isSleepIn(e));
  if (accepted) return { date: tomorrow, from: accepted.start_time!, until: accepted.end_time!, accepted: true, reason: "" };
  if (offDays.includes(tomorrow)) return null;

  // A late evening tonight: a tutorial or my own event that ends at 20:00 or later.
  const late = events.some((e) => e.date === today && e.end_time && e.end_time >= "20:00" && e.kind !== "other" && !e.cancelled);
  if (!late) return null;

  // Nothing due soon: no assignment due tomorrow or the day after, no exam within three days, not behind.
  const soon = [tomorrow, addDays(today, 2)];
  if (courses.some((c) => c.assignments.some((a) => soon.includes(a.due)))) return null;
  if (exams.some((e) => e.date > today && e.date <= addDays(today, 3))) return null;
  if (plan.warnings.length) return null;

  // A light morning: study is planned (otherwise there's nothing to move), but no fixed event in the
  // first two hours, and no more than four hours of study in the day.
  const study = plan.sessions.filter((s) => s.date === tomorrow);
  if (!study.length || study.reduce((n, s) => n + s.minutes, 0) > 240) return null;
  const busyMorning = events.some(
    (e) => e.date === tomorrow && e.start_time && e.kind !== "other" && !e.cancelled && toMin(e.start_time) < wake + 120,
  );
  if (busyMorning) return null;

  return { date: tomorrow, from, until, accepted: false, reason: "המפגש הערב נגמר מאוחר, אין הגשה קרובה והבוקר קל" };
}
