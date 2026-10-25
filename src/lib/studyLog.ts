/**
 * The study log: every reported study time (session_status rows marked done), as entries that can be
 * edited or removed. Keys look like "2026-10-25|routine|20109|routine2" (a planned session) or
 * "2026-10-25|log|20109|1792924231154" (logged by hand or with the free timer). Pure, client-safe.
 */

export type EntryKind = "log" | "routine" | "assignment" | "exam";

export interface LogEntry {
  key: string;
  date: string;
  kind: EntryKind;
  /** a 5-digit course code, or null ("other") */
  code: string | null;
  ref: string;
  minutes: number;
  /** "לימוד שוטף", "הכנה לממ״ן 01", "רישום ידני"… */
  label: string;
  /** only hand-logged entries can move to another day or course; planned ones belong to the plan */
  movable: boolean;
}

const KINDS = new Set(["log", "routine", "assignment", "exam"]);

export function labelFor(kind: EntryKind, ref: string): string {
  if (kind === "log") return "רישום ידני";
  if (kind === "routine") return /^exam\d/.test(ref) ? "חזרה לבחינה" : "לימוד שוטף";
  if (kind === "assignment") {
    const n = ref.replace(/^a/, "").replace(/-\d+$/, "");
    return `הכנה למטלה ${n}`;
  }
  return ref.startsWith("mock") ? "בחינה לדוגמה" : "חזרה לבחינה";
}

/** One row → an entry; null for rows that aren't reported study time. */
export function toEntry(row: { session_key: string; status: string; minutes: number | null }): LogEntry | null {
  if (row.status !== "done") return null;
  const [date, kind, code, ...rest] = row.session_key.split("|");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !KINDS.has(kind)) return null;
  const ref = rest.join("|");
  return {
    key: row.session_key,
    date,
    kind: kind as EntryKind,
    code: /^\d{5}$/.test(code) ? code : null,
    ref,
    minutes: Math.max(0, row.minutes ?? 0),
    label: labelFor(kind as EntryKind, ref),
    movable: kind === "log",
  };
}

/** The key a hand-logged entry gets on a (new) date and course. */
export const logKey = (date: string, code: string | null, stamp = Date.now()) => `${date}|log|${code ?? "other"}|${stamp}`;

export function totals(entries: LogEntry[]) {
  const byDay: Record<string, number> = {};
  const byCourse: Record<string, number> = {};
  let all = 0;
  for (const e of entries) {
    byDay[e.date] = (byDay[e.date] ?? 0) + e.minutes;
    const c = e.code ?? "other";
    byCourse[c] = (byCourse[c] ?? 0) + e.minutes;
    all += e.minutes;
  }
  return { byDay, byCourse, all };
}

/** How far back hours may be added or moved (days). */
export const LOG_BACK_DAYS = 60;
