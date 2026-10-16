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
  nameEn: string | null;
  opalId: number | null;
  coordinator: string | null;
  finalAssessment: string | null;
  assignmentWeight: { min: number; max: number };
  rules?: string[];
  assignments: Assignment[];
  /** The user's own colour (CSS value), hex for emails, and short name for this course. */
  color: string;
  hex: string;
  short: string;
}

export interface Semester {
  semester: string;
  source: string;
  notes: string;
}

/** The current semester (all users share it). Courses are per user, from the database. */
export const semester = { semester: (data as Semester).semester } as Pick<Semester, "semester">;

/** Course colours a user can pick. Each has a light and dark variant in globals.css. */
export const PALETTE: Record<string, { css: string; hex: string; label: string }> = {
  blue: { css: "var(--c-blue)", hex: "#2f5bd3", label: "כחול" },
  green: { css: "var(--c-green)", hex: "#12855a", label: "ירוק" },
  purple: { css: "var(--c-purple)", hex: "#8a3fc7", label: "סגול" },
  orange: { css: "var(--c-orange)", hex: "#c8641a", label: "כתום" },
  rose: { css: "var(--c-rose)", hex: "#c23a5c", label: "ורוד" },
  teal: { css: "var(--c-teal)", hex: "#0f7f8c", label: "טורקיז" },
  amber: { css: "var(--c-amber)", hex: "#a07800", label: "חרדל" },
  slate: { css: "var(--c-slate)", hex: "#55617a", label: "אפור" },
};
export const PALETTE_KEYS = Object.keys(PALETTE);

export interface CourseRow {
  code: string;
  name: string;
  name_en?: string | null;
  opal_id?: number | null;
  coordinator?: string | null;
  final_assessment?: string | null;
  min_weight: number | null;
  max_weight: number | null;
  rules?: string[] | null;
  color?: string | null;
  short?: string | null;
  assignments: { n: string; type: AssignmentType; weight: number; due: string }[];
}

/** Default short name: the course name without a trailing number, shortened. */
export function defaultShort(name: string) {
  const s = name.replace(/\s+\d+$/, "").trim();
  return s.length > 16 ? s.slice(0, 15) + "…" : s;
}

export function courseFromRow(r: CourseRow): Course {
  const pal = PALETTE[r.color ?? ""] ?? PALETTE.slate;
  return {
    code: r.code,
    name: r.name,
    nameEn: r.name_en ?? null,
    opalId: r.opal_id ?? null,
    coordinator: r.coordinator ?? null,
    finalAssessment: r.final_assessment ?? null,
    assignmentWeight: { min: r.min_weight ?? 0, max: r.max_weight ?? r.min_weight ?? 0 },
    rules: r.rules?.length ? r.rules : undefined,
    assignments: [...r.assignments].sort((a, b) => a.n.localeCompare(b.n)),
    color: pal.css,
    hex: pal.hex,
    short: r.short?.trim() || defaultShort(r.name),
  };
}

const GREY = { color: "var(--ink-soft)", hex: "#5d6880", short: "" };
/** Colour and short name of a course code among the user's courses (grey when unknown). */
export function themeOf(courses: Course[], code: string | null | undefined) {
  const c = code ? courses.find((x) => x.code === code) : undefined;
  return c ? { color: c.color, hex: c.hex, short: c.short } : { ...GREY, short: code ?? "" };
}

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

export function allDeadlines(today: string, courses: Course[]): DeadlineItem[] {
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
