/**
 * What the focus timer learns about your pace: tasks done per hour, from the last sessions with a
 * task list (kept in this browser). Used for the short summary after "סיימתי". Client-safe, pure
 * apart from the two storage helpers.
 */

export interface FocusEntry {
  date: string;
  course: string | null;
  /** minutes actually studied */
  minutes: number;
  /** minutes the timer was set to */
  planned: number;
  done: number;
  total: number;
}

const KEY = "focus:history";
const KEEP = 30;
/** at least this many sessions with tasks before the pace is trusted */
export const MIN_SESSIONS = 3;

export function readHistory(): FocusEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function recordFocus(e: FocusEntry) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...readHistory(), e].slice(-KEEP)));
  } catch {}
}

/** Tasks per hour over the last 8 sessions that had tasks (this course first, else all). */
export function pace(history: FocusEntry[], course: string | null): number | null {
  const withTasks = history.filter((h) => h.total > 0 && h.minutes >= 5);
  const mine = withTasks.filter((h) => h.course === course);
  const pool = (mine.length >= MIN_SESSIONS ? mine : withTasks).slice(-8);
  if (pool.length < MIN_SESSIONS) return null;
  const minutes = pool.reduce((n, h) => n + h.minutes, 0);
  const done = pool.reduce((n, h) => n + h.done, 0);
  return minutes > 0 && done > 0 ? (done / minutes) * 60 : null;
}

const round5 = (m: number) => Math.max(15, Math.min(180, Math.round(m / 5) * 5));

/** The lines of the after-session summary. */
export function wrapUp({
  studied,
  planned,
  done,
  total,
  open,
  rate,
}: {
  studied: number;
  planned: number;
  done: number;
  total: number;
  /** own tasks left undone (they move to the next session) */
  open: number;
  rate: number | null;
}): { headline: string; lines: string[] } {
  const headline = total ? `${done} מתוך ${total} משימות ב־${studied} דק׳` : `${studied} דק׳ של ריכוז`;
  const lines: string[] = [];
  if (open) lines.push(open === 1 ? "משימה אחת עוברת למפגש הבא בקורס." : `${open} משימות עוברות למפגש הבא בקורס.`);
  if (total && done === total && studied < planned * 0.8)
    lines.push(`הכול נגמר לפני הזמן. בפעם הבאה אפשר לכוון ל־${round5(studied)} דק׳, או להוסיף עוד משימה.`);
  else if (rate && open) lines.push(`בקצב שלך (כ־${rate < 1 ? rate.toFixed(1) : Math.round(rate)} משימות בשעה), מה שנשאר ייקח בערך ${round5((open / rate) * 60)} דק׳.`);
  else if (rate && total && done < total) lines.push(`בקצב שלך, ${total} משימות דורשות בערך ${round5((total / rate) * 60)} דק׳.`);
  else if (!total) lines.push("בפעם הבאה אפשר לרשום 2–3 משימות לזמן הזה, ו־Unihub ילמד כמה זמן הן לוקחות לך.");
  return { headline, lines };
}
