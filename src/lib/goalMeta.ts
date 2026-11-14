import { addDays, daysBetween } from "@/lib/semester";

/**
 * Goals: something with a finish line (unlike a hobby). Progress comes from one of four sources:
 * the goal's tasks, its milestones, a number moving from a start to a target, or a manual percent.
 * Everything here is pure and client-safe; lib/goals.ts loads the rows.
 */
export type GoalStatus = "idea" | "active" | "paused" | "done" | "dropped";
export type ProgressMode = "tasks" | "milestones" | "number" | "manual";
export type GoalArea = "work" | "health" | "money" | "home" | "personal" | "study";
export type GoalColor = "blue" | "green" | "purple" | "orange" | "rose" | "teal" | "amber" | "slate";

export const STATUSES: Record<GoalStatus, string> = { idea: "רעיון", active: "בתהליך", paused: "בהשהיה", done: "הושלם", dropped: "ירד מהפרק" };
/** The board's columns, in order (dropped goals are only reachable from the goal's own page). */
export const BOARD: GoalStatus[] = ["active", "idea", "paused", "done"];
export const AREAS: Record<GoalArea, string> = { work: "עבודה", health: "בריאות", money: "כסף", home: "בית", personal: "אישי", study: "לימודים" };
export const MODES: Record<ProgressMode, { label: string; desc: string }> = {
  tasks: { label: "משימות", desc: "ההתקדמות לפי כמה משימות סומנו" },
  milestones: { label: "אבני דרך", desc: "כמה שלבים גדולים הושלמו" },
  number: { label: "מספר", desc: "מספר שמתקדם ליעד: ₪, ק״מ, ק״ג, עמודים" },
  manual: { label: "הערכה שלי", desc: "אחוז שמעדכנים ביד" },
};
export const COLORS: GoalColor[] = ["blue", "green", "purple", "orange", "rose", "teal", "amber", "slate"];
export const colorVar = (c: string | null | undefined) => `var(--c-${COLORS.includes(c as GoalColor) ? c : "blue"})`;

export interface Goal {
  id: string;
  title: string;
  color: string;
  area: GoalArea;
  status: GoalStatus;
  why: string | null;
  /** what the goal is about, in the user's words */
  description?: string | null;
  started_on: string;
  due: string | null;
  progress_mode: ProgressMode;
  start_value: number | null;
  target_value: number | null;
  unit: string | null;
  weekly_minutes: number;
  routine_id: string | null;
  sort: number;
  created_at: string;
  done_at: string | null;
}
export interface Milestone {
  id: string;
  goal_id: string;
  title: string;
  due: string | null;
  done_at: string | null;
  sort: number;
  note?: string | null;
}
export interface Task {
  id: string;
  goal_id: string | null;
  title: string;
  due: string | null;
  minutes: number | null;
  done_at: string | null;
  sort: number;
  created_at: string;
  note?: string | null;
}
export interface GoalLog {
  id: string;
  goal_id: string;
  date: string;
  value: number | null;
  percent: number | null;
  minutes: number | null;
  note: string | null;
  created_at?: string;
}
/** One entry of the goal's progress journal: a short update the user writes for themselves. */
export interface GoalNote {
  id: string;
  goal_id: string;
  date: string;
  body: string;
  created_at: string;
}
export interface GoalData {
  goals: Goal[];
  milestones: Milestone[];
  tasks: Task[];
  logs: GoalLog[];
  notes?: GoalNote[];
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const day = (ts: string | null) => (ts ? ts.slice(0, 10) : null);

/** The rows of one goal. */
export function partsOf(g: Goal, d: GoalData) {
  return {
    tasks: d.tasks.filter((t) => t.goal_id === g.id),
    milestones: d.milestones.filter((m) => m.goal_id === g.id),
    logs: d.logs.filter((l) => l.goal_id === g.id),
  };
}

/** Number mode: where a value sits between start and target (works for goals that go down, like weight). */
export function numberProgress(g: Pick<Goal, "start_value" | "target_value">, value: number): number {
  const start = g.start_value ?? 0;
  const target = g.target_value;
  if (target == null || target === start) return 0;
  return clamp01((value - start) / (target - start));
}

/** The latest logged value / percent on or before a date (logs may arrive in any order). */
function latest<K extends "value" | "percent">(logs: GoalLog[], key: K, upTo: string): number | null {
  let best: GoalLog | null = null;
  for (const l of logs) if (l[key] != null && l.date <= upTo && (!best || l.date >= best.date)) best = l;
  return best ? (best[key] as number) : null;
}

/** Progress 0..1 as it stood at the end of a given day (today by default). */
export function progressAt(g: Goal, d: GoalData, date: string): number {
  const { tasks, milestones, logs } = partsOf(g, d);
  if (g.status === "done" && g.done_at && day(g.done_at)! <= date) return 1;
  if (g.progress_mode === "tasks") return tasks.length ? tasks.filter((t) => t.done_at && day(t.done_at)! <= date).length / tasks.length : 0;
  if (g.progress_mode === "milestones") return milestones.length ? milestones.filter((m) => m.done_at && day(m.done_at)! <= date).length / milestones.length : 0;
  if (g.progress_mode === "number") {
    const v = latest(logs, "value", date);
    return v == null ? 0 : numberProgress(g, v);
  }
  const p = latest(logs, "percent", date);
  return p == null ? 0 : clamp01(p / 100);
}

/** The current number of a number-mode goal (its start value before the first log). */
export function currentValue(g: Goal, d: GoalData, date: string): number {
  return latest(partsOf(g, d).logs, "value", date) ?? g.start_value ?? 0;
}

/** "5 מתוך 8 משימות", "3,000 מתוך 12,000 ₪"… the line under the title. */
export function progressText(g: Goal, d: GoalData, today: string): string {
  const { tasks, milestones } = partsOf(g, d);
  const n = (x: number) => x.toLocaleString("he-IL", { maximumFractionDigits: 1 });
  if (g.progress_mode === "tasks") return tasks.length ? `${tasks.filter((t) => t.done_at).length} מתוך ${tasks.length} משימות` : "עוד אין משימות";
  if (g.progress_mode === "milestones") return milestones.length ? `${milestones.filter((m) => m.done_at).length} מתוך ${milestones.length} אבני דרך` : "עוד אין אבני דרך";
  if (g.progress_mode === "number") return g.target_value == null ? "לא הוגדר יעד" : `${n(currentValue(g, d, today))} מתוך ${n(g.target_value)}${g.unit ? ` ${g.unit}` : ""}`;
  return `${Math.round(progressAt(g, d, today) * 100)}%`;
}

/** The last day anything moved: a task or milestone ticked, a value logged, or the goal created. */
export function lastMove(g: Goal, d: GoalData): string {
  const { tasks, milestones, logs } = partsOf(g, d);
  // writing a progress update counts: someone who reports on a goal hasn't left it
  const notes = (d.notes ?? []).filter((n) => n.goal_id === g.id).map((n) => n.date);
  const days = [day(g.created_at) ?? g.started_on, ...tasks.map((t) => day(t.done_at)), ...milestones.map((m) => day(m.done_at)), ...logs.map((l) => l.date), ...notes].filter(Boolean) as string[];
  return days.sort().at(-1)!;
}

export const STALL_DAYS = 10;
/** Days without movement, for an active goal that isn't finished; 0 when it isn't stalled. */
export function stalledDays(g: Goal, d: GoalData, today: string): number {
  if (g.status !== "active") return 0;
  const n = daysBetween(lastMove(g, d), today);
  return n >= STALL_DAYS ? n : 0;
}

/** Did the goal move since this date (inclusive)? Creating a goal doesn't count as moving it. */
export function movedSince(g: Goal, d: GoalData, since: string): boolean {
  const { tasks, milestones, logs } = partsOf(g, d);
  return [...tasks.map((t) => day(t.done_at)), ...milestones.map((m) => day(m.done_at)), ...logs.map((l) => l.date)].some((x) => x != null && x >= since);
}

/** The next thing to do: the first open task, else the first open milestone. */
export function nextStep(g: Goal, d: GoalData): { kind: "task" | "milestone"; id: string; title: string; due: string | null } | null {
  const { tasks, milestones } = partsOf(g, d);
  const bySort = <T extends { sort: number; due: string | null }>(a: T, b: T) => a.sort - b.sort || (a.due ?? "9").localeCompare(b.due ?? "9");
  const t = tasks.filter((x) => !x.done_at).sort(bySort)[0];
  if (t) return { kind: "task", id: t.id, title: t.title, due: t.due };
  const m = milestones.filter((x) => !x.done_at).sort(bySort)[0];
  return m ? { kind: "milestone", id: m.id, title: m.title, due: m.due } : null;
}

/** Progress per day from the goal's start to today. (The chart uses timeline(); this stays for daily summaries and tests.) */
export function series(g: Goal, d: GoalData, today: string, maxPoints = 40): { date: string; p: number }[] {
  const start = g.started_on <= today ? g.started_on : today;
  const span = Math.max(1, daysBetween(start, today));
  const step = Math.max(1, Math.ceil(span / (maxPoints - 1)));
  const out: { date: string; p: number }[] = [];
  for (let i = 0; i < span; i += step) out.push({ date: addDays(start, i), p: progressAt(g, d, addDays(start, i)) });
  out.push({ date: today, p: progressAt(g, d, today) });
  return out;
}

/** The last 8 weeks as 8 numbers 0..1, for the small trend line on a card. */
export function spark(g: Goal, d: GoalData, today: string): number[] {
  return Array.from({ length: 8 }, (_, i) => progressAt(g, d, addDays(today, -7 * (7 - i))));
}

/**
 * When the goal will be finished at the recent pace: the pace of the last 28 days (or since the
 * start, if shorter). null when there's no forward movement to project from, or it's already done.
 */
export function projectedFinish(g: Goal, d: GoalData, today: string): string | null {
  const now = progressAt(g, d, today);
  if (now >= 1) return null;
  const back = Math.min(28, Math.max(1, daysBetween(g.started_on, today)));
  const then = daysBetween(g.started_on, today) <= 28 ? 0 : progressAt(g, d, addDays(today, -back));
  const rate = (now - then) / back;
  if (rate <= 0) return null;
  const days = Math.ceil((1 - now) / rate);
  return days > 3650 ? null : addDays(today, days);
}

/** Where the straight line from start to deadline says the goal should be today (null without a deadline). */
export function plannedNow(g: Goal, today: string): number | null {
  if (!g.due) return null;
  const total = daysBetween(g.started_on, g.due);
  return total <= 0 ? 1 : clamp01(daysBetween(g.started_on, today) / total);
}

/** Ready-made goals: a way of measuring and a few first steps. Everything stays editable. */
export const TEMPLATES: { title: string; area: GoalArea; color: GoalColor; mode: ProgressMode; start?: number; target?: number; unit?: string; steps: string[] }[] = [
  { title: "לרוץ 10 ק״מ", area: "health", color: "green", mode: "number", start: 0, target: 10, unit: "ק״מ", steps: [] },
  { title: "לחסוך לטיול", area: "money", color: "orange", mode: "number", start: 0, target: 10000, unit: "₪", steps: [] },
  { title: "פרויקט צד", area: "work", color: "blue", mode: "milestones", steps: ["רעיון ותכנון", "גרסה ראשונה שעובדת", "להראות למישהו", "גרסה מוגמרת"] },
  { title: "מעבר דירה", area: "home", color: "teal", mode: "tasks", steps: ["תקציב ואזורים", "לראות דירות", "חוזה", "הובלה", "העברת חשבונות וכתובת"] },
  { title: "ללמוד שפה", area: "personal", color: "purple", mode: "milestones", steps: ["300 המילים הנפוצות", "הצגה עצמית בעל־פה", "שיחה של 5 דקות", "סדרה עם כתוביות בשפה"] },
  { title: "לקרוא ספר", area: "personal", color: "amber", mode: "number", start: 0, target: 300, unit: "עמודים", steps: [] },
];

/** Soft limit: more active goals than this and the board suggests pausing one. */
export const WIP_LIMIT = 4;

/**
 * Today's short list: the next step of each active goal (at most `max`), then loose tasks that are
 * due today or overdue. Goals with a dated step come first, the most urgent on top.
 */
export function todaySteps(d: GoalData, today: string, max = 3): { goal: Goal | null; kind: "task" | "milestone"; id: string; title: string; due: string | null }[] {
  const steps = d.goals
    .filter((g) => g.status === "active")
    .map((g) => ({ goal: g as Goal | null, step: nextStep(g, d) }))
    .filter((x) => x.step)
    .sort((a, b) => (a.step!.due ?? "9").localeCompare(b.step!.due ?? "9") || a.goal!.sort - b.goal!.sort)
    .slice(0, max)
    .map((x) => ({ goal: x.goal, ...x.step! }));
  const loose = d.tasks
    .filter((t) => !t.goal_id && !t.done_at && t.due && t.due <= today)
    .sort((a, b) => a.due!.localeCompare(b.due!))
    .slice(0, 5)
    .map((t) => ({ goal: null, kind: "task" as const, id: t.id, title: t.title, due: t.due }));
  return [...steps, ...loose];
}

/**
 * Phone reminders about goals. Each key is sent once.
 * - From 18:00: a task or milestone of an active goal that is due tomorrow.
 * - From 10:00: an active goal on the day it has stood still for 10 days, then every 7 days after.
 */
export function goalPushes(d: GoalData, now: { date: string; minutes: number }): { key: string; title: string; body: string; url: string }[] {
  const out: { key: string; title: string; body: string; url: string }[] = [];
  const tomorrow = addDays(now.date, 1);
  for (const g of d.goals) {
    if (g.status !== "active") continue;
    const { tasks, milestones } = partsOf(g, d);
    if (now.minutes >= 18 * 60)
      for (const s of [...milestones, ...tasks]) if (!s.done_at && s.due === tomorrow) out.push({ key: `gd|${s.id}|${s.due}`, title: `מחר: ${s.title}`, body: g.title, url: `/goals/${g.id}` });
    const n = stalledDays(g, d, now.date);
    if (now.minutes >= 10 * 60 && n && (n - STALL_DAYS) % 7 === 0)
      out.push({ key: `gs|${g.id}|${now.date}`, title: `״${g.title}״ מחכה כבר ${n} ימים`, body: "מה הצעד הכי קטן שאפשר לעשות היום? ואם זה לא הזמן, אפשר להשהות.", url: `/goals/${g.id}` });
  }
  return out;
}

/** Minutes logged on goals per day (the focus timer, manual logs, ticking a goal's routine). */
export function goalMinutesByDay(d: GoalData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of d.logs) if (l.minutes) out[l.date] = (out[l.date] ?? 0) + l.minutes;
  return out;
}

/** Minutes logged on one goal from a date on (inclusive). */
export function goalMinutesSince(g: Goal, d: GoalData, since: string): number {
  return d.logs.reduce((n, l) => n + (l.goal_id === g.id && l.minutes && l.date >= since ? l.minutes : 0), 0);
}

/** The numbers the goals badges are computed from. */
export function goalBadgeStats(d: GoalData, weekStartDay: string): { done: number; steps: number; movedThisWeek: number; minutes: number; comebacks: number } {
  let comebacks = 0;
  for (const g of d.goals) {
    const { tasks, milestones, logs } = partsOf(g, d);
    const moves = [...tasks.map((t) => day(t.done_at)), ...milestones.map((m) => day(m.done_at)), ...logs.map((l) => l.date)].filter(Boolean).sort() as string[];
    // moving again after standing still: a gap of STALL_DAYS or more between two movements
    for (let i = 1; i < moves.length; i++) if (daysBetween(moves[i - 1], moves[i]) >= STALL_DAYS) comebacks++;
  }
  return {
    done: d.goals.filter((g) => g.status === "done").length,
    steps: d.tasks.filter((t) => t.done_at).length + d.milestones.filter((m) => m.done_at).length,
    movedThisWeek: d.goals.filter((g) => g.status === "active" && movedSince(g, d, weekStartDay)).length,
    minutes: d.logs.reduce((n, l) => n + (l.minutes ?? 0), 0),
    comebacks,
  };
}

/** The goal's journal, newest first. */
export function notesOf(g: Goal, d: GoalData): GoalNote[] {
  return (d.notes ?? []).filter((n) => n.goal_id === g.id).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
}

export interface ChartPoint {
  /** time in ms */
  t: number;
  p: number;
  /** what happened at this point (a task ticked, a number logged) */
  label?: string;
}

/**
 * Progress over time for the chart, from the moment the goal was created until now, built from
 * what actually happened and when (not one point per day, so a goal that is a few hours old
 * already has a line). One point per step; the chart joins them with a smooth rising curve,
 * and the stretch from the last step to now is level.
 */
export function timeline(g: Goal, d: GoalData, now: number): ChartPoint[] {
  const { tasks, milestones, logs } = partsOf(g, d);
  const t0 = Math.min(Date.parse(g.created_at), now);
  const events: ChartPoint[] = [];
  const steps = (rows: { title: string; done_at: string | null }[]) => {
    const done = rows.filter((r) => r.done_at).sort((a, b) => a.done_at!.localeCompare(b.done_at!));
    done.forEach((r, i) => events.push({ t: Date.parse(r.done_at!), p: (i + 1) / rows.length, label: r.title }));
  };
  // a log has a date; its clock time is taken from when it was written, if that was the same day
  const logTime = (l: GoalLog) => {
    const noon = Date.parse(l.date + "T12:00:00Z");
    const made = l.created_at ? Date.parse(l.created_at) : NaN;
    return Number.isFinite(made) && Math.abs(made - noon) < 36 * 3_600_000 ? made : noon;
  };
  if (g.progress_mode === "tasks") steps(tasks);
  else if (g.progress_mode === "milestones") steps(milestones);
  else {
    const key = g.progress_mode === "number" ? "value" : "percent";
    for (const l of logs) {
      const v = l[key];
      if (v == null) continue;
      events.push(g.progress_mode === "number" ? { t: logTime(l), p: numberProgress(g, v), label: `${v.toLocaleString("he-IL", { maximumFractionDigits: 1 })}${g.unit ? ` ${g.unit}` : ""}` } : { t: logTime(l), p: clamp01(v / 100), label: `${v}%` });
    }
    events.sort((a, b) => a.t - b.t);
  }
  if (g.status === "done" && g.done_at) events.push({ t: Date.parse(g.done_at), p: 1, label: "הושלם" });

  const out: ChartPoint[] = [{ t: t0, p: 0 }];
  for (const e of events) {
    if (!(e.t <= now)) continue;
    const prev = out.at(-1)!;
    // a step can't share an instant with the point before it (the curve needs time to pass):
    // after the starting point it lands a moment later; otherwise the later value replaces the earlier
    if (e.t > prev.t) out.push(e);
    else if (out.length === 1) out.push({ ...e, t: prev.t + 1 });
    else out[out.length - 1] = { ...e, t: prev.t };
  }
  if (now > out.at(-1)!.t) out.push({ t: now, p: out.at(-1)!.p });
  return out;
}

/**
 * Slopes for a smooth curve through the points that never overshoots them (monotone cubic,
 * Fritsch–Carlson): between two points the curve stays between their values, so progress that
 * only goes up is drawn as a line that only goes up.
 */
export function curveSlopes(points: ChartPoint[]): number[] {
  const n = points.length;
  if (n < 2) return points.map(() => 0);
  const d = points.slice(1).map((q, i) => (q.p - points[i].p) / (q.t - points[i].t));
  const m = points.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * d[i];
      m[i + 1] = k * b * d[i];
    }
  }
  return m;
}

/** The curve's value at a moment (before the start: the first value; after the end: the last). */
export function curveAt(points: ChartPoint[], t: number, slopes = curveSlopes(points)): number {
  if (!points.length) return 0;
  if (t <= points[0].t) return points[0].p;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (t > b.t) continue;
    const h = b.t - a.t;
    const u = (t - a.t) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a.p + (u3 - 2 * u2 + u) * h * slopes[i - 1] + (-2 * u3 + 3 * u2) * b.p + (u3 - u2) * h * slopes[i];
  }
  return points.at(-1)!.p;
}
