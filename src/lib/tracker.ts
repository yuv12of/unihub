/**
 * ממ"ן tracker: questions per file assignment, the checklist for the last 48 hours, and
 * spotting the submission-confirmation mail.
 */
import type { Course } from "@/lib/semester";

export type QStatus = "todo" | "doing" | "done" | "stuck";
export const Q_LABEL: Record<QStatus, string> = { todo: "לא התחלתי", doing: "בעבודה", done: "סיימתי", stuck: "תקוע" };
export const Q_NEXT: Record<QStatus, QStatus> = { todo: "doing", doing: "done", done: "todo", stuck: "doing" };

export const CHECKLIST: { id: string; text: string }[] = [
  { id: "parts", text: "כל שאלה וכל סעיף קיבלו תשובה" },
  { id: "export", text: "ייצוא מ־Notability ל־PDF" },
  { id: "scan", text: "הסריקה קריאה והעמודים לפי הסדר" },
  { id: "submit", text: "הגשה במערכת המטלות" },
  { id: "mail", text: "התקבל מייל אישור הגשה" },
];

/**
 * The submission-confirmation mail from the OU assignment system.
 *
 * No such mail exists in the database yet (checked 24.10.2026: only "הודעה על סיום בדיקת מטלה",
 * the grading notice), so this is deliberately strict: an openu.ac.il sender, a subject that
 * says the assignment was received/submitted, not a grading or reminder mail, a course code of
 * one of the user's courses and an assignment number, all present. Anything less: no match.
 */
export function submissionConfirmation(
  mail: { subject: string; sender: string; body: string },
  courses: Course[],
): { course_code: string; n: string } | null {
  if (!/openu\.ac\.il/i.test(mail.sender)) return null;
  const subject = mail.subject.replace(/\s+/g, " ");
  const confirm = /(אישור (על )?(קבלת|הגשת)|התקבלה|נקלטה|הוגשה( בהצלחה)?)/;
  if (!confirm.test(subject) || !/מטל|ממ["״']?[נןח]/.test(subject)) return null;
  if (/בדיקת|נבדקה|ציון|תזכורת|נדח|הוארך|בחינה/.test(subject)) return null;
  const text = `${subject}\n${mail.body.slice(0, 4000)}`;
  const code = [...text.matchAll(/\b(\d{5})\b/g)].map((m) => m[1]).find((c) => courses.some((x) => x.code === c));
  if (!code) return null;
  const course = courses.find((c) => c.code === code)!;
  const m = text.match(/(מטלה|ממ["״']?[נןח])\s*(?:מס(?:פר|['׳])?\s*)?(\d{1,2})(?!\d)/);
  if (!m) return null;
  const num = Number(m[2]);
  // OU numbering: ממ"ן 11, 12… are the file assignments in order, ממ"ח 01, 02… the online ones.
  const a = /ח/.test(m[1])
    ? course.assignments.filter((x) => x.type === "online")[num - 1]
    : num >= 11
      ? course.assignments.filter((x) => x.type === "file")[num - 11]
      : course.assignments.find((x) => Number(x.n) === num);
  return a ? { course_code: code, n: a.n } : null;
}
