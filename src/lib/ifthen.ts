/**
 * If-then fallback plans ("implementation intentions"): written at the Saturday week planning,
 * e.g. "אם לא התחלתי עד 09:30 → 15 דקות כרטיסיות". When the app sees the trigger, the push quotes
 * the user's own plan and opens a short focus timer. Pure: the push tick gathers the context.
 */
import { duration, range } from "@/lib/time";

export const TRIGGER_KINDS = ["session_not_started", "missed_day", "routine_missed", "behind_goal"] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export interface IfThenParams {
  /** session_not_started: minutes after the planned start */
  after?: number;
  /** missed_day: "HH:MM" by which some study should be logged */
  by?: string;
  /** routine_missed: which routine */
  routine_id?: string;
  /** behind_goal: minutes missing from the weekly goal (after the plan) that count as behind */
  gap?: number;
  /** behind_goal: when to check, "HH:MM" */
  at?: string;
  /** missed_day / behind_goal: weekdays it applies (0 = Sunday) */
  days?: number[];
}

export interface IfThenPlan {
  id: string;
  kind: TriggerKind;
  params: IfThenParams;
  action: string;
  active: boolean;
}

export interface TriggerContext {
  date: string;
  /** minutes since midnight, Israel time */
  minutes: number;
  weekday: number;
  /** today's planned study sessions (skipped ones already removed) */
  sessions: { key: string; start: string; end: string; title: string; status?: "done" | "skipped" }[];
  /** a focus timer is running now, started at this many minutes after midnight today (null: none) */
  liveStartedAt: number | null;
  /** study minutes logged today (sessions marked done + quick logs) */
  studiedToday: number;
  /** today's routine occurrences */
  routines: { routineId: string; title: string; start: string | null; end: string | null; done: boolean }[];
  week?: { goal: number | null; done: number; planned: number };
}

export interface Fired {
  plan: IfThenPlan;
  /** dedupe key: every plan fires at most once a day */
  key: string;
  /** what happened, in Hebrew */
  because: string;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** How long after the trigger time a late tick may still fire (the tick runs every ~10 minutes). */
const LATE = 120;

export function evaluateIfThen(plans: IfThenPlan[], ctx: TriggerContext): Fired[] {
  const out: Fired[] = [];
  const key = (p: IfThenPlan) => `if|${p.id}|${ctx.date}`;
  const studyingNow = ctx.liveStartedAt != null;
  for (const p of plans) {
    if (!p.active || !p.action.trim()) continue;
    const prm = p.params ?? {};
    if (p.kind === "session_not_started") {
      const after = clamp(prm.after ?? 15, 5, 120);
      const s = ctx.sessions
        .filter((x) => !x.status)
        .find((x) => {
          const st = toMin(x.start);
          // a timer started from just before the session counts as starting it
          const started = studyingNow && ctx.liveStartedAt! >= st - 15;
          return !started && ctx.minutes >= st + after && ctx.minutes < Math.min(toMin(x.end), st + after + LATE);
        });
      if (s) out.push({ plan: p, key: key(p), because: `המפגש של ${range(s.start)} (${s.title}) עוד לא התחיל` });
    } else if (p.kind === "missed_day") {
      const by = prm.by && HHMM.test(prm.by) ? toMin(prm.by) : 18 * 60;
      const days = prm.days?.length ? prm.days : [0, 1, 2, 3, 4];
      if (days.includes(ctx.weekday) && ctx.minutes >= by && ctx.minutes < by + LATE && ctx.studiedToday === 0 && !studyingNow)
        out.push({ plan: p, key: key(p), because: `עד ${range(minToHHMM(by))} עוד לא נרשם לימוד היום` });
    } else if (p.kind === "routine_missed") {
      const o = ctx.routines.find((r) => r.routineId === prm.routine_id && !r.done && r.end);
      if (o && ctx.minutes >= toMin(o.end!) && ctx.minutes < toMin(o.end!) + LATE)
        out.push({ plan: p, key: key(p), because: `${o.title} לא סומן היום` });
    } else if (p.kind === "behind_goal") {
      const at = prm.at && HHMM.test(prm.at) ? toMin(prm.at) : 20 * 60;
      const days = prm.days?.length ? prm.days : [3];
      const w = ctx.week;
      if (!w?.goal || !days.includes(ctx.weekday) || ctx.minutes < at || ctx.minutes >= at + LATE) continue;
      const gap = w.goal - w.done - w.planned;
      if (gap > clamp(prm.gap ?? 120, 15, 3000)) out.push({ plan: p, key: key(p), because: `חסרות ${hours(gap)} ליעד השבועי, גם אחרי מה שמתוכנן` });
    }
  }
  return out;
}

/** The focus timer length a plan asks for: "15 דקות כרטיסיות" → 15, "רבע שעה" → 15, anything else → 2 (a two-minute start). */
export function focusMinutesOf(action: string): number {
  const m = action.match(/(\d{1,3})\s*(?:דק|ד׳|ד')/);
  if (m) return clamp(Number(m[1]), 2, 120);
  if (/רבע שעה/.test(action)) return 15;
  if (/חצי שעה/.test(action)) return 30;
  if (/שעה וחצי/.test(action)) return 90;
  if (/(^|\s)שעה(\s|$)/.test(action)) return 60;
  return 2;
}

/** The phone notification: the user's own words first. */
export function ifThenPush(f: Fired): { key: string; title: string; body: string; url: string } {
  const min = focusMinutesOf(f.plan.action);
  return {
    key: f.key,
    title: `התוכנית שלך: ${f.plan.action}`,
    body: `${f.because}. זה מה שהחלטת בתכנון השבוע. להתחיל ${min === 2 ? "שתי דקות" : `${min} דק׳`}?`,
    url: `/?focus=1&min=${min}`,
  };
}

/** Only the params that kind uses, in range. */
export function cleanParams(kind: TriggerKind, raw: Record<string, unknown>): IfThenParams {
  const num = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) && v !== "" && v != null ? clamp(Math.round(Number(v)), lo, hi) : d);
  const time = (v: unknown, d: string) => (typeof v === "string" && HHMM.test(v) ? v : d);
  const days = (v: unknown, d: number[]) => (Array.isArray(v) ? [...new Set(v.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort() : d);
  if (kind === "session_not_started") return { after: num(raw.after, 5, 120, 15) };
  if (kind === "missed_day") return { by: time(raw.by, "18:00"), days: days(raw.days, [0, 1, 2, 3, 4]) };
  if (kind === "routine_missed") return { routine_id: typeof raw.routine_id === "string" ? raw.routine_id.slice(0, 64) : undefined };
  return { gap: num(raw.gap, 15, 3000, 120), at: time(raw.at, "20:00"), days: days(raw.days, [3]) };
}

const DAY = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

/** "אם לא התחלתי מפגש לימוד 15 דק׳ אחרי הזמן" — the if-part, for lists. */
export function describeTrigger(kind: TriggerKind, p: IfThenParams, routineTitle?: string): string {
  if (kind === "session_not_started") return `אם לא התחלתי מפגש לימוד ${p.after ?? 15} דק׳ אחרי הזמן`;
  if (kind === "missed_day") return `אם עד ${range(p.by ?? "18:00")} לא למדתי כלום${daysText(p.days, [0, 1, 2, 3, 4])}`;
  if (kind === "routine_missed") return `אם פספסתי את ${routineTitle ?? "השגרה"}`;
  return `אם ${daysText(p.days, [3], true)} ב־${range(p.at ?? "20:00")} חסרות לי יותר מ־${hours(p.gap ?? 120)} ליעד השבועי`;
}

function daysText(days: number[] | undefined, d: number[], bare = false) {
  const list = days?.length ? days : d;
  if (list.join() === "0,1,2,3,4") return bare ? "בימי א׳–ה׳" : " (א׳–ה׳)";
  const t = list.map((x) => DAY[x]).join(", ");
  return bare ? `ביום ${t}` : ` (${t})`;
}

export const IF_THEN_TEMPLATES: { kind: TriggerKind; params: IfThenParams; action: string }[] = [
  { kind: "session_not_started", params: { after: 15 }, action: "15 דקות כרטיסיות, בלי להחליט כלום" },
  { kind: "missed_day", params: { by: "18:00", days: [0, 1, 2, 3, 4] }, action: "לפתוח את הפרק בעמוד שעצרתי ולקרוא 2 דקות" },
  { kind: "routine_missed", params: {}, action: "20 דקות הליכה לפני ארוחת הערב" },
  { kind: "behind_goal", params: { gap: 180, at: "20:00", days: [3] }, action: "מחר הבלוק הראשון הוא הממ״ן, לא קריאה" },
];

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function minToHHMM(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function hours(min: number) {
  return duration(Math.round(min / 15) * 15);
}
