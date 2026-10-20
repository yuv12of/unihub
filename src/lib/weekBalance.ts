/**
 * The week at a glance: how much awake time is still free, and how study (done + planned) compares
 * with the weekly goal. Pure, so the calendar can recompute it the moment an event is moved.
 */
export interface TimedBlock {
  start: string; // "HH:MM"
  end: string;
  kind: string; // "study" counts as planned study, everything else as taken time
  minutes?: number;
  status?: "done" | "skipped";
}

export interface WeekBalance {
  /** free awake minutes left this week (from now on) */
  free: number;
  /** free minutes left per date */
  freeByDay: Record<string, number>;
  /** study minutes logged this week so far */
  done: number;
  /** planned study minutes still ahead (not done, not skipped) */
  planned: number;
  goal: number | null;
  /** minutes still missing to reach the goal after the plan (0 when the plan gets there) */
  gap: number;
  past: boolean;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Total length of the union of intervals clipped to [lo, hi]. */
function covered(intervals: [number, number][], lo: number, hi: number): number {
  const xs = intervals
    .map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curA = -1;
  let curB = -1;
  for (const [a, b] of xs) {
    if (a > curB) {
      if (curB > curA) total += curB - curA;
      curA = a;
      curB = b;
    } else curB = Math.max(curB, b);
  }
  if (curB > curA) total += curB - curA;
  return total;
}

export function weekBalance({
  days,
  blocksOn,
  today,
  nowMin,
  wake,
  bed,
  studied,
  goal,
}: {
  days: string[]; // the 7 dates of the week
  blocksOn: (date: string) => TimedBlock[];
  today: string;
  nowMin: number;
  wake: number; // minutes from midnight
  bed: number; // minutes from midnight (may be 1440)
  studied: Record<string, number>; // minutes logged per date
  goal: number | null;
}): WeekBalance {
  const freeByDay: Record<string, number> = {};
  let free = 0;
  let planned = 0;
  for (const d of days) {
    if (d < today) continue;
    const lo = d === today ? Math.max(wake, nowMin) : wake;
    if (lo >= bed) {
      freeByDay[d] = 0;
      continue;
    }
    const blocks = blocksOn(d);
    const taken = covered(
      blocks.filter((b) => b.status !== "skipped").map((b) => [toMin(b.start), toMin(b.end)]),
      lo,
      bed,
    );
    freeByDay[d] = bed - lo - taken;
    free += freeByDay[d];
    for (const b of blocks)
      if (b.kind === "study" && !b.status && (d > today || toMin(b.start) >= nowMin)) planned += b.minutes ?? toMin(b.end) - toMin(b.start);
  }
  const done = days.reduce((n, d) => n + (studied[d] ?? 0), 0);
  const gap = goal ? Math.max(0, goal - done - planned) : 0;
  return { free, freeByDay, done, planned, goal, gap, past: days[6] < today };
}

/** "7:30 ש׳", "45 דק׳" */
export function hoursLabel(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}${r ? `:${String(r).padStart(2, "0")}` : ""} ש׳` : `${r} דק׳`;
}
