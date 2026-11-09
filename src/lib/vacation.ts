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
