/**
 * How Unihub writes lengths of time and clock ranges, everywhere.
 *
 * - A duration never looks like a clock time: 90 → "שעה ו־30 דק׳", not "1:30 ש׳".
 * - A clock range is wrapped in Unicode isolates (LRI…PDI) so it reads 08:45–10:15 inside Hebrew text,
 *   in the browser, in push notifications and in emails alike.
 */

/** 45 → "45 דק׳", 60 → "שעה", 120 → "שעתיים", 300 → "5 שעות", 90 → "שעה ו־30 דק׳", 150 → "2 ש׳ ו־30 דק׳". */
export function duration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} דק׳`;
  const hours = h === 1 ? "שעה" : h === 2 ? "שעתיים" : `${h} שעות`;
  if (!m) return hours;
  return `${h === 1 ? "שעה" : `${h} ש׳`} ו־${m} דק׳`;
}

/** The same, short: 90 → "1.5 ש׳", 75 → "1 ש׳ 15 ד׳", 45 → "45 ד׳". For tight spots (chips, bars). */
export function durationShort(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} ד׳`;
  if (!m) return `${h} ש׳`;
  if (m === 30) return `${h}.5 ש׳`;
  return `${h} ש׳ ${m} ד׳`;
}

const LRI = "⁦";
const PDI = "⁩";

/** "24:00" (runs to midnight) reads as 00:00. */
export const clock = (t: string) => (t === "24:00" ? "00:00" : t);

/** "08:45–10:15", isolated left-to-right so it never flips in Hebrew text. Missing end → just the start. */
export function range(start: string | null | undefined, end?: string | null): string {
  if (!start) return "";
  if (!end || end === start) return `${LRI}${clock(start)}${PDI}`;
  return `${LRI}${clock(start)}–${clock(end)}${PDI}`;
}

/** Any left-to-right run (dates like 23.10–30.10, page spans) isolated the same way. */
export const ltr = (s: string) => `${LRI}${s}${PDI}`;
