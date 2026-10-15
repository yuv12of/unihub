/**
 * Study planner: turns deadlines, exam dates and weekly availability into dated study sessions.
 *
 * Pure and deterministic, so the app and the calendar feed always show the same plan.
 * Rules, in priority order each day:
 *   1. Assignment prep in the 14 days before a deadline (earliest deadline first).
 *   2. Exam revision in the 21 days before an exam.
 *   3. Optional routine study, rotating between courses, in whatever time is left.
 */
import { addDays, daysBetween, semester, typeLabel, courseTheme, type Course } from "@/lib/semester";
import { progressKey, type ProgressMap } from "@/lib/progress";

export interface DaySlot {
  start: string; // "18:00"
  minutes: number; // 0 = not studying that day
}
export type Availability = Record<string, DaySlot>; // "0" (Sunday) .. "6"

export interface StudyPrefs {
  availability: Availability;
  session_minutes: number;
  fill_routine: boolean;
}

export const defaultPrefs: StudyPrefs = {
  availability: {
    "0": { start: "18:00", minutes: 120 },
    "1": { start: "18:00", minutes: 120 },
    "2": { start: "18:00", minutes: 120 },
    "3": { start: "18:00", minutes: 120 },
    "4": { start: "18:00", minutes: 120 },
    "5": { start: "10:00", minutes: 120 },
    "6": { start: "20:00", minutes: 0 },
  },
  session_minutes: 90,
  fill_routine: true,
};

export interface Exam {
  course_code: string;
  moed: string;
  date: string;
  start_time: string | null;
}

export type SessionKind = "assignment" | "exam" | "routine";

export interface Session {
  date: string;
  start: string;
  end: string;
  minutes: number;
  courseCode: string;
  kind: SessionKind;
  title: string; // "הכנה לממ״ן 01 באינפי"
}

export interface PlanWarning {
  courseCode: string;
  title: string;
  missingMinutes: number;
}

export interface Plan {
  sessions: Session[];
  warnings: PlanWarning[];
}

const PREP_WINDOW_DAYS = 14;
const EXAM_WINDOW_DAYS = 21;
const EXAM_MINUTES = 20 * 60;
const BREAK_MINUTES = 15;
const MIN_CHUNK = 30;

/** Rough study time an assignment needs, by type and grade weight. */
export function prepMinutes(type: string, weight: number): number {
  if (type === "file") return 120 + weight * 60; // weight 3 → 5h
  if (type === "online") return 90;
  return 0; // participation: attend tutorials, nothing to prepare
}

interface Task {
  courseCode: string;
  kind: "assignment" | "exam";
  title: string;
  from: string; // first day work may happen
  until: string; // last day work may happen
  deadline: string;
  remaining: number;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
const toHHMM = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const weekday = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay();

/** Next upcoming exam for each course (earliest moed on or after today). */
export function nextExams(exams: Exam[], today: string): Exam[] {
  const byCourse = new Map<string, Exam>();
  for (const e of exams) {
    if (e.date < today) continue;
    const cur = byCourse.get(e.course_code);
    if (!cur || e.date < cur.date) byCourse.set(e.course_code, e);
  }
  return [...byCourse.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildPlan({
  today,
  prefs,
  progress,
  exams,
  courses = semester.courses,
}: {
  today: string;
  prefs: StudyPrefs;
  progress: ProgressMap;
  exams: Exam[];
  courses?: Course[];
}): Plan {
  const tasks: Task[] = [];

  for (const c of courses) {
    for (const a of c.assignments) {
      const status = progress[progressKey(c.code, a.n)]?.status;
      if (status === "submitted" || status === "skipped" || a.due < today) continue;
      const need = prepMinutes(a.type, a.weight);
      if (!need) continue;
      const until = addDays(a.due, -1) < today ? today : addDays(a.due, -1);
      tasks.push({
        courseCode: c.code,
        kind: "assignment",
        title: `${typeLabel[a.type]} ${a.n} ב${courseTheme[c.code].short}`,
        from: maxIso(today, addDays(a.due, -PREP_WINDOW_DAYS)),
        until,
        deadline: a.due,
        remaining: need,
      });
    }
  }

  for (const e of nextExams(exams, today)) {
    tasks.push({
      courseCode: e.course_code,
      kind: "exam",
      title: `בחינה ב${courseTheme[e.course_code]?.short ?? e.course_code}`,
      from: maxIso(today, addDays(e.date, -EXAM_WINDOW_DAYS)),
      until: maxIso(today, addDays(e.date, -1)),
      deadline: e.date,
      remaining: EXAM_MINUTES,
    });
  }

  const lastAssignment = courses.flatMap((c) => c.assignments.map((a) => a.due)).sort().at(-1) ?? today;
  const horizon = [lastAssignment, ...tasks.map((t) => t.until)].sort().at(-1)!;

  const sessions: Session[] = [];
  const routineLoad = new Map<string, number>(courses.map((c) => [c.code, 0]));
  const examDays = new Set(exams.map((e) => e.date));

  for (let day = today; day <= horizon; day = addDays(day, 1)) {
    const slot = prefs.availability[String(weekday(day))];
    if (!slot || slot.minutes < MIN_CHUNK || examDays.has(day)) continue;
    let cursor = toMin(slot.start);
    let capacity = slot.minutes;
    const usedToday = new Set<Task>();

    const place = (minutes: number, courseCode: string, kind: SessionKind, title: string) => {
      sessions.push({
        date: day,
        start: toHHMM(cursor),
        end: toHHMM(cursor + minutes),
        minutes,
        courseCode,
        kind,
        title,
      });
      cursor += minutes + BREAK_MINUTES;
      capacity -= minutes + BREAK_MINUTES;
    };

    // 1 + 2: deadline-driven work, earliest deadline first, one session per task per day
    // unless a task is falling behind (more work left than sessions left before its deadline).
    for (let round = 0; round < 2 && capacity >= MIN_CHUNK; round++) {
      const eligible = tasks
        .filter((t) => t.remaining > 0 && t.from <= day && day <= t.until)
        .filter((t) => (round === 0 ? !usedToday.has(t) : behind(t, day, prefs)))
        .sort((a, b) => a.deadline.localeCompare(b.deadline) || (a.kind === "assignment" ? -1 : 1));
      for (const t of eligible) {
        if (capacity < MIN_CHUNK) break;
        const chunk = Math.min(prefs.session_minutes, t.remaining, capacity);
        if (chunk < MIN_CHUNK && chunk < t.remaining) continue;
        place(chunk, t.courseCode, t.kind, t.kind === "exam" ? `חזרה ל${t.title}` : `הכנה ל${t.title}`);
        t.remaining -= chunk;
        usedToday.add(t);
      }
    }

    // 3: routine study for the course that has had the least of it so far.
    if (prefs.fill_routine && capacity >= MIN_CHUNK) {
      const code = [...routineLoad.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
      if (code) {
        const chunk = Math.min(prefs.session_minutes, capacity);
        place(chunk, code, "routine", `לימוד שוטף ב${courseTheme[code].short}`);
        routineLoad.set(code, (routineLoad.get(code) ?? 0) + chunk);
      }
    }
  }

  const warnings = tasks
    .filter((t) => t.remaining > 0)
    .map((t) => ({ courseCode: t.courseCode, title: t.title, missingMinutes: t.remaining }));

  return { sessions, warnings };
}

function behind(t: Task, day: string, prefs: StudyPrefs): boolean {
  let capacityLeft = 0;
  for (let d = addDays(day, 1); d <= t.until; d = addDays(d, 1)) {
    const slot = prefs.availability[String(weekday(d))];
    if (slot) capacityLeft += Math.min(slot.minutes, prefs.session_minutes);
  }
  return t.remaining > capacityLeft;
}

function maxIso(a: string, b: string) {
  return a > b ? a : b;
}

export function minutesLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} דק׳`;
  if (!m) return h === 1 ? "שעה" : h === 2 ? "שעתיים" : `${h} שעות`;
  return `${h}:${String(m).padStart(2, "0")} ש׳`;
}

export function daysUntil(today: string, iso: string) {
  return daysBetween(today, iso);
}
