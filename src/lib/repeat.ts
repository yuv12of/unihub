/**
 * Repeating events. A series is stored as one row per date (sharing series_id and this rule), so the
 * plan, reminders and the calendar feed treat each date like any other event.
 */
export type RepeatFreq = "daily" | "weekdays" | "weekly" | "monthly";

export interface Repeat {
  freq: RepeatFreq;
  /** weekly: every N weeks (1 or 2) */
  every?: number;
  /** weekly: weekdays, 0 = Sunday */
  days?: number[];
  /** last date (inclusive) */
  until: string;
}

export const MAX_OCCURRENCES = 366;

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay();
export const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000,
  );

/** Checks a rule from the browser. Returns a clean copy or null. */
export function cleanRepeat(r: unknown, first: string): Repeat | null {
  if (!r || typeof r !== "object") return null;
  const x = r as Partial<Repeat>;
  if (!["daily", "weekdays", "weekly", "monthly"].includes(x.freq as string))
    return null;
  if (
    typeof x.until !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(x.until) ||
    x.until <= first
  )
    return null;
  const until = x.until > addDays(first, 730) ? addDays(first, 730) : x.until;
  if (x.freq !== "weekly") return { freq: x.freq!, until };
  const days = [
    ...new Set(
      (x.days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    ),
  ].sort();
  return {
    freq: "weekly",
    every: x.every === 2 ? 2 : 1,
    days: days.length ? days : [weekday(first)],
    until,
  };
}

/** Every date of the series, starting with `first` (which is always included). */
export function repeatDates(first: string, r: Repeat): string[] {
  const out = [first];
  const firstWeek = addDays(first, -weekday(first));
  for (
    let d = addDays(first, 1);
    d <= r.until && out.length < MAX_OCCURRENCES;
    d = addDays(d, 1)
  ) {
    const wd = weekday(d);
    const ok =
      r.freq === "daily" ||
      (r.freq === "weekdays" && wd <= 4) ||
      (r.freq === "monthly" && d.slice(8) === first.slice(8)) ||
      (r.freq === "weekly" &&
        (r.days ?? []).includes(wd) &&
        Math.floor(daysBetween(firstWeek, d) / 7) % (r.every ?? 1) === 0);
    if (ok) out.push(d);
  }
  return out;
}

const DAY = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

/** "כל שבוע בימים א׳, ג׳ עד 31.1" */
export function describeRepeat(r: Repeat): string {
  const until = `עד ${Number(r.until.slice(8))}.${Number(r.until.slice(5, 7))}`;
  if (r.freq === "daily") return `כל יום ${until}`;
  if (r.freq === "weekdays") return `בימים א׳–ה׳ ${until}`;
  if (r.freq === "monthly") return `כל חודש ${until}`;
  const days = (r.days ?? []).map((d) => DAY[d]).join(", ");
  return `${r.every === 2 ? "כל שבועיים" : "כל שבוע"} ב${(r.days ?? []).length > 1 ? "ימים" : "יום"} ${days} ${until}`;
}
