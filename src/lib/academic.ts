import data from "@/data/academic-2027.json";
import { addDays } from "@/lib/semester";

export interface AcademicEvent {
  date: string;
  end?: string;
  title: string;
  holiday?: boolean;
}

export const academicEvents = data.events as AcademicEvent[];
export const academicSource = data.source;

/** Academic-calendar entries touching a given day (multi-day ranges included). */
export function academicOn(iso: string): AcademicEvent[] {
  return academicEvents.filter((e) => (e.end ? e.date <= iso && iso <= e.end : e.date === iso));
}

/** Expand ranges into one entry per day, for calendar views. Long ranges only show on their first and last day. */
export function academicByDay(): { date: string; title: string; holiday: boolean }[] {
  const out: { date: string; title: string; holiday: boolean }[] = [];
  for (const e of academicEvents) {
    if (!e.end) {
      out.push({ date: e.date, title: e.title, holiday: !!e.holiday });
      continue;
    }
    const long = (Date.parse(e.end) - Date.parse(e.date)) / 86_400_000 > 10;
    for (let d = e.date; d <= e.end; d = addDays(d, 1)) {
      if (long && d !== e.date && d !== e.end) continue;
      const suffix = long ? (d === e.date ? " (מתחילה)" : " (מסתיימת)") : "";
      out.push({ date: d, title: e.title + suffix, holiday: !!e.holiday });
    }
  }
  return out;
}
