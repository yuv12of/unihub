/** Vacations: runs of consecutive "vacation" rest days, shown and cancelled as one. Pure. */
import { addDays, daysBetween } from "@/lib/semester";

export const VACATION_MAX_DAYS = 60;

export interface Vacation {
  from: string;
  to: string;
}

/** The days from `from` to `to`, both included (ISO dates). */
export function daysOf(from: string, to: string): string[] {
  const n = daysBetween(from, to);
  return Array.from({ length: Math.max(0, n + 1) }, (_, i) => addDays(from, i));
}

/** Consecutive dates grouped into vacations. */
export function vacationsOf(dates: string[]): Vacation[] {
  const out: Vacation[] = [];
  for (const d of [...new Set(dates)].sort()) {
    const last = out.at(-1);
    if (last && addDays(last.to, 1) === d) last.to = d;
    else out.push({ from: d, to: d });
  }
  return out;
}

export interface ImpactItem {
  date: string;
  kind: string;
  label: string;
  minutes?: number;
  status?: "done" | "skipped";
  /** a submitted or waived deadline */
  done?: boolean;
  optional?: boolean;
}

/** Days after a vacation that still count as "right after it" for deadlines and exams. */
export const AFTER_DAYS = 3;

/**
 * What a vacation from `from` to `to` would touch, before it's saved: deadlines and exams in it or
 * in the three days after it, meetings I'd miss, and the planned study that would move.
 */
export function vacationImpact<I extends ImpactItem>(items: I[], from: string, to: string) {
  const inside = (d: string) => d >= from && d <= to;
  const after = (d: string) => d > to && d <= addDays(to, AFTER_DAYS);
  const due = items.filter((i) => i.kind === "due" && !i.done && i.status !== "done" && i.status !== "skipped");
  const study = items.filter((i) => i.kind === "study" && inside(i.date) && i.status !== "done" && i.status !== "skipped");
  return {
    dueInside: due.filter((i) => inside(i.date)),
    dueAfter: due.filter((i) => after(i.date)),
    exams: items.filter((i) => i.kind === "exam" && (inside(i.date) || after(i.date))),
    meetings: items.filter((i) => i.kind === "tutorial" && !i.optional && inside(i.date)),
    studyMinutes: study.reduce((s, i) => s + (i.minutes ?? 0), 0),
    sessions: study.length,
  };
}
