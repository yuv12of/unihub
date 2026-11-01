/**
 * How crowded a semester's exams are. Pure and client-safe.
 * Exam days per semester come from the yedion (src/data/exam-sittings.json); which course falls on which
 * day is known only once Sheilta's notice arrives (the exams table). Before that the warning is about the
 * number of exams against the exam period; after it, about the actual gaps between chosen dates.
 */
import data from "@/data/exam-sittings.json";
import { COURSE, nameOf, semLabel, termOf, type DegreePlan } from "@/lib/degree";

const SITTINGS = data.semesters as Record<string, { a: string[]; b: string[] }>;
export const SITTINGS_SOURCE = data.source;

const shift = (iso: string, days: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const gap = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000);
const fmt = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`;

/** Exam days of a semester's מועד א׳ / ב׳; later years shifted by whole weeks from the latest published. */
export function sittingsFor(sem: string): { a: string[]; b: string[]; estimated: boolean } | null {
  if (SITTINGS[sem]) return { ...SITTINGS[sem], estimated: false };
  const base = Object.keys(SITTINGS)
    .filter((s) => termOf(s) === termOf(sem))
    .sort()
    .at(-1);
  if (!base) return null;
  const k = (Number(sem.slice(0, 4)) - Number(base.slice(0, 4))) * 364;
  return { a: SITTINGS[base].a.map((d) => shift(d, k)), b: SITTINGS[base].b.map((d) => shift(d, k)), estimated: true };
}

export interface KnownExam {
  course_code: string;
  date: string;
  moed: string;
  chosen?: boolean | null;
}

export interface ExamLoad {
  sem: string;
  /** courses of the semester that end in an exam */
  courses: { code: string; name: string; date: string | null }[];
  level: "ok" | "busy" | "heavy";
  text: string;
  /** pairs of chosen/known מועד א׳ dates close together */
  close: { a: string; b: string; days: number }[];
}

/**
 * @param known exam dates already known for this semester (the exams table: one row per date; a course's
 *   chosen מועד א׳ row wins, else its earliest מועד א׳ date)
 */
export function examLoad(plan: DegreePlan, sem: string, known: KnownExam[] = []): ExamLoad | null {
  const items = plan.items.filter((i) => i.sem === sem && !i.credited && (COURSE[i.code]?.exam ?? true));
  if (!items.length) return null;
  const dateOf = (code: string) => {
    const rows = known.filter((k) => k.course_code === code && /א/.test(k.moed)).sort((x, y) => x.date.localeCompare(y.date));
    return (rows.find((r) => r.chosen) ?? rows[0])?.date ?? null;
  };
  const courses = items.map((i) => ({ code: i.code, name: nameOf(i), date: dateOf(i.code) }));
  const n = courses.length;
  const dated = courses.filter((c) => c.date).sort((x, y) => x.date!.localeCompare(y.date!));
  const close: ExamLoad["close"] = [];
  for (let k = 1; k < dated.length; k++) {
    const d = gap(dated[k - 1].date!, dated[k].date!);
    if (d <= 4) close.push({ a: dated[k - 1].name, b: dated[k].name, days: d });
  }
  if (dated.length >= 2) {
    const tight = close.filter((c) => c.days <= 2);
    const level = tight.length ? "heavy" : close.length ? "busy" : "ok";
    const text = close.length
      ? close.map((c) => `${c.a} ו${c.b} ${c.days === 0 ? "באותו יום" : c.days === 1 ? "בימים רצופים" : `בהפרש ${c.days} ימים`}`).join(" · ") +
        ". במועד א׳ יש בדרך כלל שני תאריכים לכל קורס: אפשר לבחור את המרווח יותר."
      : `${n} בחינות, לפחות ${Math.min(...dated.slice(1).map((c, k) => gap(dated[k].date!, c.date!)))} ימים בין בחינה לבחינה.`;
    return { sem, courses, level, text, close };
  }
  const s = sittingsFor(sem);
  const span = s && s.a.length ? gap(s.a[0], s.a[s.a.length - 1]) : 35;
  const per = n > 1 ? Math.round(span / n) : span;
  const where = s && s.a.length ? ` (${fmt(s.a[0])}–${fmt(s.a[s.a.length - 1])}${s.estimated ? ", משוער" : ""})` : "";
  const level = n >= 5 ? "heavy" : n === 4 ? "busy" : "ok";
  const text =
    n === 1
      ? `בחינה אחת במועד א׳${where}.`
      : `${n} בחינות בתקופת בחינות של כ־${Math.round(span / 7)} שבועות${where}: בממוצע כ־${per} ימים ביניהן. התאריכים לכל קורס מתפרסמים במהלך ${semLabel(sem)}.`;
  return { sem, courses, level, text, close };
}
