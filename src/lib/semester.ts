import data from "@/data/semester-2027a.json";

export type AssignmentType = "file" | "online" | "participation";

export interface Assignment {
  n: string;
  type: AssignmentType;
  weight: number;
  due: string; // YYYY-MM-DD, deadline day (Israel time)
  originalDue?: string; // set when the user's deadline was extended
}

export interface Course {
  code: string;
  name: string;
  nameEn: string;
  opalId: number;
  coordinator: string;
  finalAssessment: string;
  assignmentWeight: { min: number; max: number };
  rules?: string[];
  books?: string[];
  assignments: Assignment[];
}

export interface Semester {
  semester: string;
  source: string;
  notes: string;
  courses: Course[];
}

export const semester = data as Semester;

/** Stable visual identity per course. */
export const courseTheme: Record<string, { color: string; short: string }> = {
  "20109": { color: "var(--c-algebra)", short: "לינארית" },
  "20474": { color: "var(--c-calculus)", short: "אינפי" },
  "20407": { color: "var(--c-ds)", short: "מבני נתונים" },
};

export const typeLabel: Record<AssignmentType, string> = {
  file: "ממ״ן",
  online: "ממ״ח",
  participation: "השתתפות",
};

const TZ = "Asia/Jerusalem";

/** Today's date in Israel as YYYY-MM-DD. */
export function todayInIsrael(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
}

/** Whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z");
  return Math.round(ms / 86_400_000);
}

export function formatHebrewDate(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("he-IL", { timeZone: "UTC", ...opts }).format(
    new Date(iso + "T00:00:00Z"),
  );
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface DeadlineItem extends Assignment {
  course: Course;
  daysLeft: number;
}

export function allDeadlines(today: string, courses: Course[] = semester.courses): DeadlineItem[] {
  return courses
    .flatMap((course) =>
      course.assignments.map((a) => ({ ...a, course, daysLeft: daysBetween(today, a.due) })),
    )
    .sort((x, y) => x.due.localeCompare(y.due) || x.course.code.localeCompare(y.course.code));
}

export function relativeDays(n: number): string {
  if (n === 0) return "היום";
  if (n === 1) return "מחר";
  if (n === 2) return "מחרתיים";
  if (n < 0) return n === -1 ? "אתמול" : `לפני ${-n} ימים`;
  return `בעוד ${n} ימים`;
}
