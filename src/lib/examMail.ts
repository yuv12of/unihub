/**
 * Exam dates from university mail. Pure: the mail ingest, the push tick scan and the tests share it.
 *
 * Real shape (Sheilta "הודעה על מועדי בחינות בקורסים", a PDF attachment whose text the tick extracts):
 * a box table, right-to-left text stored left-to-right, two lines per course:
 *   | (93 ב1 )ב | | (83 א3 )ב( | 88 א8 )ה | 2025ב 20474|
 *   |30.03.2026 | |19.02.2026 |09.02.2026 | |חשבון אינפיניטסימלי 1
 * Each date sits under a code whose letter is the מועד (א8 = מועד א, sitting 88; ב1 = מועד ב).
 * Moed א may have two dates (you pick one when registering). The course cell carries the semester
 * the course belongs to ("2025ב 20474").
 * Other notices (exam invitation "זימון לבחינה", forum posts) are read line by line: a course code of
 * mine, a date, maybe a time and a מועד word, close together. That path has no real sample yet.
 */

export type Moed = "א" | "ב" | "מיוחד";

export interface ExamDate {
  course_code: string;
  moed: Moed;
  date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM
}

export interface ExamMailInput {
  subject?: string | null;
  body_text?: string | null;
  /** text of the mail's attachments (PDF text layer / OCR) */
  attachments?: (string | null | undefined)[];
}

/** Subjects and texts worth reading. */
export const EXAM_MAIL = /(מועדי\s*(ה)?בחינ|לוח\s*(ה)?בחינות|זימון\s*לבחינה|הזמנה\s*לבחינה|הרשמה\s*לבחינה|שיבוץ\s*לבחינה|מועד\s*(א|ב|מיוחד)['׳]?\s)/;

/**
 * @param courses my current course codes (only these are returned)
 * @param semester current semester as the university writes it ("2027א"); a course cell naming another
 *   semester is skipped (old notices list last semester's repeat exams)
 */
export function parseExamDates(mail: ExamMailInput, courses: string[], semester: string): ExamDate[] {
  const mine = new Set(courses);
  const texts = [mail.body_text ?? "", ...(mail.attachments ?? []).map((a) => a ?? "")].filter(Boolean);
  const out: ExamDate[] = [];
  for (const t of texts) {
    const table = fromTable(t, mine, semester);
    out.push(...(table.length ? table : fromLines(t, mine, semester, mail.subject ?? "")));
  }
  return dedupe(out);
}

// ---------- the Sheilta box table ----------

function fromTable(text: string, mine: Set<string>, semester: string): ExamDate[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim().startsWith("|"));
  const out: ExamDate[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const head = lines[i].split("|");
    const course = head.map((c) => c.match(/(\d{4}[אבג])\s+(\d{5})/)).find(Boolean);
    if (!course) continue;
    const [, sem, code] = course;
    const dates = lines[i + 1].split("|");
    i++; // the date row belongs to this course
    if (!mine.has(code) || (semester && sem !== semester)) continue;
    head.forEach((cell, k) => {
      const d = dates[k]?.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
      if (!d) return;
      const moed = /מיוחד/.test(cell) ? "מיוחד" : cell.match(/([אב])\d/)?.[1];
      const date = isoDate(d[1], d[2], d[3]);
      if (moed && date) out.push({ course_code: code, moed: moed as Moed, date, start_time: null });
    });
  }
  return out;
}

// ---------- free text (invitations, forum posts) ----------

const DATE_RE = /(?<![\d/.])(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?![\d/.])/g;
const TIME_RE = /(?:בשעה|שעה|שעת התחלה|ב־|ב-)?\s*\b([01]?\d|2[0-3]):([0-5]\d)\b/;
/** Dates that are deadlines, not exams. */
const NOT_EXAM = /(תיסגר|תסגר|נסגרת|עד\s*(ה)?תאריך|אחרון\s*ל|ביטול|הגשה|ממ["״]?ן|מטלה)/;

function fromLines(text: string, mine: Set<string>, semester: string, subject: string): ExamDate[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim());
  const out: ExamDate[] = [];
  const semTagEn = semester.replace("א", "a").replace("ב", "b").replace("ג", "c");
  const subjectCode = [...subject.matchAll(/\b(\d{5})\b/g)].map((m) => m[1]).find((c) => mine.has(c)) ?? null;
  let current: string | null = subjectCode; // the course a line belongs to: last code seen
  let moed: Moed | null = moedIn(subject);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    for (const m of l.matchAll(/\b(\d{5})(?:-(\d{4}[abc]))?\b/g)) {
      if (m[2] && m[2] !== semTagEn) {
        current = null;
        continue;
      }
      if (mine.has(m[1])) current = m[1];
    }
    moed = moedIn(l) ?? moed;
    if (!current) continue;
    for (const d of l.matchAll(DATE_RE)) {
      const before = l.slice(Math.max(0, d.index! - 30), d.index!);
      if (NOT_EXAM.test(before)) continue;
      const date = isoDate(d[1], d[2], d[3]);
      if (!date) continue;
      const after = `${l.slice(d.index! + d[0].length)} ${lines[i + 1] ?? ""}`;
      const t = after.match(TIME_RE);
      out.push({ course_code: current, moed: moed ?? "א", date, start_time: t ? `${t[1].padStart(2, "0")}:${t[2]}` : null });
    }
  }
  return out;
}

function moedIn(s: string): Moed | null {
  if (/מועד\s*מיוחד/.test(s)) return "מיוחד";
  const m = s.match(/מועד\s*["'׳]?([אב])(?![א-ת])/);
  return m ? (m[1] as Moed) : null;
}

/** dd/mm/yyyy, dd.mm.yy → YYYY-MM-DD (null when not a real date). */
export function isoDate(d: string, m: string, y: string): string | null {
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  const iso = `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const t = new Date(iso + "T00:00:00Z");
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso && year >= 2020 && year <= 2100 ? iso : null;
}

function dedupe(list: ExamDate[]): ExamDate[] {
  const seen = new Map<string, ExamDate>();
  for (const e of list) {
    const k = `${e.course_code}|${e.moed}|${e.date}`;
    const had = seen.get(k);
    if (!had || (!had.start_time && e.start_time)) seen.set(k, e);
  }
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date) || a.course_code.localeCompare(b.course_code));
}

/** exams.moed allows א/ב/ג: a special sitting is stored as ג. */
export const examsMoed = (m: Moed) => (m === "מיוחד" ? "ג" : m);
