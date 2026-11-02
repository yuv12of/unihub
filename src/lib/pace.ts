/**
 * The pace of an assignment: how many of its parts have answers, over time, against a steady line
 * across the planner's own prep window (from two weeks before the deadline, or the previous deadline
 * if later, to the day before the deadline). Pure; the timeline is recorded in assignment_pace.
 */
import { addDays, daysBetween } from "@/lib/semester";
import { PART_NO_PREFIX, PART_PREFIX } from "@/lib/sheetStructure";

/** The planner's prep window (planner.ts PREP_WINDOW_DAYS). */
export const PREP_DAYS = 14;

export interface PacePoint {
  /** ISO time */
  at: string;
  answered: number;
  total: number;
}

export type Now = { date: string; minutes: number };

/** Parts with an answer: what I marked wins, otherwise what the detection found. */
export function answeredCount(itemKeys: string[], detected: string[], checks: string[]): number {
  const yes = new Set(checks.filter((c) => c.startsWith(PART_PREFIX)).map((c) => c.slice(PART_PREFIX.length)));
  const no = new Set(checks.filter((c) => c.startsWith(PART_NO_PREFIX)).map((c) => c.slice(PART_NO_PREFIX.length)));
  const found = new Set(detected);
  return itemKeys.filter((k) => yes.has(k) || (found.has(k) && !no.has(k))).length;
}

/**
 * The prep window of assignment n: from the later of two weeks before its deadline and the course's
 * previous deadline (any assignment type), to the day before its deadline.
 */
export function paceWindow(assignments: { n: string; due: string }[], n: string, semesterStart: string): { start: string; target: string } | null {
  const a = assignments.find((x) => x.n === n);
  if (!a) return null;
  const prev = assignments
    .filter((x) => x.n !== n && x.due < a.due)
    .map((x) => x.due)
    .sort()
    .at(-1);
  const target = addDays(a.due, -1);
  let start = [addDays(a.due, -PREP_DAYS), prev ?? semesterStart, semesterStart].sort().at(-1)!;
  if (start > addDays(target, -2)) start = addDays(target, -2);
  return { start, target };
}

/** The share of the parts that should have answers by `now`: a steady line over the window. */
export function expectedShare(win: { start: string; target: string }, now: Now): number {
  const span = daysBetween(win.start, win.target) + 1;
  if (span <= 0) return 1;
  const elapsed = daysBetween(win.start, now.date) + now.minutes / 1440;
  return Math.max(0, Math.min(1, elapsed / span));
}

export type PaceStatus = "done" | "ahead" | "on" | "behind";

/** How far from the plan: "behind" once a part and a bit (≥15%) short of where the plan is. */
export function paceStatus(answered: number, total: number, share: number): { status: PaceStatus; expected: number; gap: number } {
  const expected = share * total;
  const gap = Math.round(expected - answered);
  if (total > 0 && answered >= total) return { status: "done", expected, gap: 0 };
  const slack = Math.max(1, Math.ceil(total * 0.15));
  if (answered < expected - slack) return { status: "behind", expected, gap };
  if (answered >= expected + 1) return { status: "ahead", expected, gap };
  return { status: "on", expected, gap };
}

export interface PaceInput {
  code: string;
  courseName: string;
  n: string;
  label: string;
  due: string;
  window: { start: string; target: string };
  /** the latest recorded point; no point means I never used the check, so no warning either */
  last: PacePoint | null;
}

/**
 * A once-a-day phone warning (from 17:00) when an open assignment with 5 days or fewer left is
 * behind my plan. Never for an assignment I haven't started tracking.
 */
export function paceWarnings(items: PaceInput[], now: Now) {
  if (now.minutes < 17 * 60) return [];
  const out: { key: string; title: string; body: string; url: string }[] = [];
  for (const it of items) {
    const left = daysBetween(now.date, it.due);
    if (!it.last || it.last.total <= 0 || left < 0 || left > 5) continue;
    const { status, expected } = paceStatus(it.last.answered, it.last.total, expectedShare(it.window, now));
    if (status !== "behind") continue;
    out.push({
      key: `pace|${it.code}|${it.n}|${now.date}`,
      title: `${it.label} ב${it.courseName}: מאחורי התוכנית`,
      body: `${it.last.answered} מתוך ${it.last.total} סעיפים עם תשובה. לפי התוכנית היו כבר ${Math.round(expected)}. ${left === 0 ? "ההגשה היום." : left === 1 ? "ההגשה מחר." : `נשארו ${left} ימים.`}`,
      url: `/courses/${it.code}#assignments`,
    });
  }
  return out;
}
