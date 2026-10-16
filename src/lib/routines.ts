/**
 * Life routines: sleep, meals, sport, habits, chores, hobbies, time with people.
 *
 * Two kinds:
 *  - fixed: on set weekdays at a set time ("gym Mon+Wed 07:00, 1h"). Timed fixed routines can block
 *    study time, so the study planner works around them.
 *  - flexible: a weekly goal ("gym 3× a week, 1h, evenings"). Placed into free time after the study
 *    plan, spread across the week. Times already done this week count toward the goal.
 * A routine with 0 minutes (or no time) is a to-do with a checkbox, not a calendar block.
 *
 * Everything here is pure and deterministic, so the app, the calendar feed and reminders agree.
 */
import { addDays } from "@/lib/semester";
import type { Busy } from "@/lib/planner";

export type RoutineCategory = "sleep" | "meal" | "sport" | "health" | "habit" | "chore" | "hobby" | "social" | "other";
export type TimeWindow = "morning" | "noon" | "afternoon" | "evening" | "any";

export interface Routine {
  id: string;
  user_id: string;
  title: string;
  emoji: string | null;
  category: RoutineCategory;
  mode: "fixed" | "flexible";
  days: number[];
  start_time: string | null;
  minutes: number;
  per_week: number | null;
  time_window: TimeWindow;
  blocks_study: boolean;
  active: boolean;
}

export interface RoutineLog {
  routine_id: string;
  date: string;
  user_id?: string;
}

export interface Occurrence {
  routineId: string;
  title: string;
  emoji: string;
  category: RoutineCategory;
  date: string;
  start: string | null;
  end: string | null;
  minutes: number;
  done: boolean;
  flexible: boolean;
}

export const CATEGORY: Record<RoutineCategory, { label: string; emoji: string; color: string }> = {
  sleep: { label: "שינה", emoji: "🌙", color: "var(--c-slate)" },
  meal: { label: "ארוחות", emoji: "🍽️", color: "var(--c-amber)" },
  sport: { label: "ספורט", emoji: "🏃", color: "var(--c-orange)" },
  health: { label: "בריאות", emoji: "💊", color: "var(--c-teal)" },
  habit: { label: "הרגלים", emoji: "✨", color: "var(--c-purple)" },
  chore: { label: "מטלות בית", emoji: "🧺", color: "var(--c-green)" },
  hobby: { label: "תחביבים", emoji: "🎸", color: "var(--c-rose)" },
  social: { label: "אנשים שאני אוהב", emoji: "❤️", color: "var(--c-rose)" },
  other: { label: "אחר", emoji: "•", color: "var(--c-slate)" },
};

export const WINDOWS: Record<TimeWindow, { label: string; from: string; to: string }> = {
  morning: { label: "בוקר", from: "07:00", to: "12:00" },
  noon: { label: "צהריים", from: "12:00", to: "15:00" },
  afternoon: { label: "אחר הצהריים", from: "15:00", to: "18:30" },
  evening: { label: "ערב", from: "18:00", to: "22:30" },
  any: { label: "מתי שנוח", from: "08:00", to: "22:00" },
};

export const DAY_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
export const toHHMM = (min: number) =>
  `${String(Math.floor(((min % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((min % 60) + 60) % 60).padStart(2, "0")}`;
const weekday = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay();
export const weekStart = (iso: string) => addDays(iso, -weekday(iso));

const timed = (r: Routine) => !!r.start_time && r.minutes > 0;
export const emojiOf = (r: Pick<Routine, "emoji" | "category">) => r.emoji || CATEGORY[r.category].emoji;

/** When the day starts and ends, from a fixed sleep routine (bedtime + length). Default 07:00–23:00. */
export function awakeWindow(routines: Routine[]): { wake: number; bed: number } {
  const sleep = routines.find((r) => r.active && r.category === "sleep" && r.mode === "fixed" && timed(r));
  if (!sleep) return { wake: 7 * 60, bed: 23 * 60 };
  const bed = toMin(sleep.start_time!);
  const wake = (bed + sleep.minutes) % 1440;
  return { wake, bed: bed < wake ? 24 * 60 : bed };
}

/** Busy intervals from timed fixed routines (only those that block study), split at midnight. */
export function routineBusy(routines: Routine[], from: string, to: string): Busy[] {
  const out: Busy[] = [];
  for (const r of routines) {
    if (!r.active || r.mode !== "fixed" || !timed(r) || !r.blocks_study) continue;
    for (let d = addDays(from, -1); d <= to; d = addDays(d, 1)) {
      if (!r.days.includes(weekday(d))) continue;
      const s = toMin(r.start_time!);
      const e = s + r.minutes;
      if (d >= from) out.push({ date: d, start: toHHMM(s), end: e >= 1440 ? "23:59" : toHHMM(e) });
      if (e > 1440 && addDays(d, 1) <= to) out.push({ date: addDays(d, 1), start: "00:00", end: toHHMM(e - 1440) });
    }
  }
  return out;
}

/** Earliest free gap of `len` minutes inside [from, to) avoiding `taken` intervals (with a small break). */
function findSlot(taken: [number, number][], from: number, to: number, len: number): number | null {
  const sorted = [...taken].sort((a, b) => a[0] - b[0]);
  let t = from;
  for (const [s, e] of sorted) {
    if (e + 10 <= t) continue;
    if (s - 10 >= t + len) break;
    t = Math.max(t, e + 10);
  }
  return t + len <= to ? t : null;
}

/** Picks `n` of the candidate days, spread out across them. */
function spread<T>(items: T[], n: number): T[] {
  if (n >= items.length) return items;
  const out: T[] = [];
  for (let k = 0; k < n; k++) out.push(items[Math.floor(((k + 0.5) * items.length) / n)]);
  return out;
}

/**
 * All routine occurrences in [from, to].
 * `taken` = other things on each day (events, study sessions) that flexible routines must not overlap.
 */
export function expandRoutines({
  routines,
  logs,
  from,
  to,
  today,
  taken = [],
}: {
  routines: Routine[];
  logs: RoutineLog[];
  from: string;
  to: string;
  today: string;
  taken?: Busy[];
}): Occurrence[] {
  const active = routines.filter((r) => r.active);
  const doneSet = new Set(logs.map((l) => `${l.routine_id}|${l.date}`));
  const occ: Occurrence[] = [];
  const make = (r: Routine, date: string, start: number | null, flexible: boolean): Occurrence => ({
    routineId: r.id,
    title: r.title,
    emoji: emojiOf(r),
    category: r.category,
    date,
    start: start == null ? null : toHHMM(start),
    end: start == null ? null : toHHMM(start + r.minutes),
    minutes: r.minutes,
    done: doneSet.has(`${r.id}|${date}`),
    flexible,
  });

  // Fixed routines.
  for (const r of active.filter((x) => x.mode === "fixed"))
    for (let d = from; d <= to; d = addDays(d, 1))
      if (r.days.includes(weekday(d))) occ.push(make(r, d, timed(r) ? toMin(r.start_time!) : null, false));

  // Flexible routines, week by week.
  const { wake, bed } = awakeWindow(active);
  const takenOn = (d: string): [number, number][] => [
    ...taken.filter((b) => b.date === d).map((b) => [toMin(b.start), toMin(b.end)] as [number, number]),
    ...occ.filter((o) => o.date === d && o.start).map((o) => [toMin(o.start!), toMin(o.start!) + o.minutes] as [number, number]),
  ];
  for (const r of active.filter((x) => x.mode === "flexible")) {
    const goal = r.per_week ?? 1;
    for (let ws = weekStart(from); ws <= to; ws = addDays(ws, 7)) {
      const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
      const doneDays = days.filter((d) => doneSet.has(`${r.id}|${d}`));
      const open = days.filter((d) => d >= today && !doneSet.has(`${r.id}|${d}`));
      const chosen = spread(open, Math.max(0, goal - doneDays.length));
      for (const d of [...doneDays, ...chosen].sort()) {
        if (d < from || d > to) continue;
        let start: number | null = null;
        if (timed(r) || r.minutes > 0) {
          const w = WINDOWS[r.time_window];
          const lo = Math.max(toMin(w.from), wake + 30);
          const hi = Math.min(toMin(w.to), bed - 15);
          start = findSlot(takenOn(d), lo, hi, r.minutes);
        }
        occ.push(make(r, d, start, true));
      }
    }
  }
  return occ.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? "99").localeCompare(b.start ?? "99"));
}

/** This week's progress toward a routine's goal. */
export function weekProgress(r: Routine, logs: RoutineLog[], today: string) {
  const ws = weekStart(today);
  const done = logs.filter((l) => l.routine_id === r.id && l.date >= ws && l.date <= addDays(ws, 6)).length;
  const target = r.mode === "flexible" ? (r.per_week ?? 1) : r.days.length;
  return { done, target };
}

/** Streak: days in a row for daily routines, weeks in a row (goal met) for the rest. */
export function streak(r: Routine, logs: RoutineLog[], today: string): { count: number; unit: "days" | "weeks" } {
  const mine = new Set(logs.filter((l) => l.routine_id === r.id).map((l) => l.date));
  const daily = (r.mode === "fixed" && r.days.length === 7) || (r.mode === "flexible" && (r.per_week ?? 0) >= 7);
  if (daily) {
    let d = mine.has(today) ? today : addDays(today, -1);
    let n = 0;
    while (mine.has(d)) {
      n++;
      d = addDays(d, -1);
    }
    return { count: n, unit: "days" };
  }
  const target = r.mode === "flexible" ? (r.per_week ?? 1) : r.days.length;
  const met = (ws: string) => Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => mine.has(d)).length >= target;
  let ws = weekStart(today);
  let n = met(ws) ? 1 : 0;
  ws = addDays(ws, -7);
  while (n < 520 && met(ws)) {
    n++;
    ws = addDays(ws, -7);
  }
  return { count: n, unit: "weeks" };
}

export const timesAWeek = (n: number) =>
  n >= 7 ? "כל יום" : n === 1 ? "פעם בשבוע" : n === 2 ? "פעמיים בשבוע" : `${n} פעמים בשבוע`;

/** "א׳ ג׳ ה׳ · 07:00 · שעה" style description. */
export function describe(r: Routine): string {
  const len = r.minutes ? (r.minutes % 60 === 0 ? `${r.minutes / 60} ש׳` : `${r.minutes} דק׳`) : "בלי זמן קבוע";
  if (r.category === "sleep" && r.start_time && r.minutes)
    return `${r.start_time}–${toHHMM(toMin(r.start_time) + r.minutes)}`;
  if (r.mode === "flexible")
    return `${timesAWeek(r.per_week ?? 1)} · ${len}${r.minutes ? ` · ${WINDOWS[r.time_window].label}` : ""}`;
  const days = r.days.length === 7 ? "כל יום" : [...r.days].sort().map((d) => DAY_LETTERS[d] + "׳").join(" ");
  return `${days}${r.start_time && r.minutes ? ` · ${r.start_time}` : ""} · ${len}`;
}

/** Ready-made routines for the "add" menu. */
export const TEMPLATES: Omit<Routine, "id" | "user_id" | "active">[] = [
  { title: "שינה", emoji: "🌙", category: "sleep", mode: "fixed", days: [0, 1, 2, 3, 4, 5, 6], start_time: "23:30", minutes: 450, per_week: null, time_window: "any", blocks_study: true },
  { title: "ארוחת ערב", emoji: "🍽️", category: "meal", mode: "fixed", days: [0, 1, 2, 3, 4, 5, 6], start_time: "19:30", minutes: 30, per_week: null, time_window: "any", blocks_study: true },
  { title: "אימון", emoji: "🏋️", category: "sport", mode: "flexible", days: [], start_time: null, minutes: 60, per_week: 3, time_window: "evening", blocks_study: true },
  { title: "ריצה", emoji: "🏃", category: "sport", mode: "flexible", days: [], start_time: null, minutes: 40, per_week: 2, time_window: "morning", blocks_study: true },
  { title: "קריאה", emoji: "📖", category: "habit", mode: "flexible", days: [], start_time: null, minutes: 20, per_week: 7, time_window: "evening", blocks_study: true },
  { title: "שתיית מים", emoji: "💧", category: "health", mode: "fixed", days: [0, 1, 2, 3, 4, 5, 6], start_time: null, minutes: 0, per_week: null, time_window: "any", blocks_study: false },
  { title: "כביסה", emoji: "🧺", category: "chore", mode: "flexible", days: [], start_time: null, minutes: 45, per_week: 1, time_window: "any", blocks_study: true },
  { title: "ניקיון החדר", emoji: "🧹", category: "chore", mode: "flexible", days: [], start_time: null, minutes: 30, per_week: 1, time_window: "afternoon", blocks_study: true },
  { title: "זמן עם המשפחה", emoji: "❤️", category: "social", mode: "flexible", days: [], start_time: null, minutes: 120, per_week: 1, time_window: "evening", blocks_study: true },
  { title: "שיחה עם סבתא", emoji: "📞", category: "social", mode: "flexible", days: [], start_time: null, minutes: 0, per_week: 1, time_window: "any", blocks_study: false },
  { title: "תחביב", emoji: "🎸", category: "hobby", mode: "flexible", days: [], start_time: null, minutes: 60, per_week: 2, time_window: "evening", blocks_study: true },
];

export function daysUntilNext(r: Routine, today: string): number | null {
  if (r.mode !== "fixed" || !r.days.length) return null;
  for (let i = 0; i < 7; i++) if (r.days.includes(weekday(addDays(today, i)))) return i;
  return null;
}
