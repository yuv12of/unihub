/**
 * Study planner: turns deadlines, exam dates and weekly availability into dated study sessions.
 *
 * Pure and deterministic, so the app and the calendar feed always show the same plan.
 * Rules, in priority order each day:
 *   1. Assignment prep in the 14 days before a deadline (earliest deadline first).
 *   2. Exam revision in the 21 days before an exam.
 *   3. Optional routine study, rotating between courses, in whatever time is left.
 * Work already done on earlier days (sessions marked done) is credited, and anything not done
 * simply stays in the remaining work, so missed sessions roll forward on their own.
 * A session marked skipped keeps its slot empty and its work moves to another day.
 */
import { addDays, daysBetween, typeLabel, themeOf, type Course } from "@/lib/semester";
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
  /** Hebcal settings (see lib/hebcal) */
  jewish?: import("@/lib/hebcal").JewishPrefs | null;
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
  sessionTitle: string;
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

export interface Busy {
  date: string;
  start: string;
  end: string;
}

/** Stable identity for a planned session, used to remember done / skipped. */
export function sessionKey(s: Pick<Session, "date" | "kind" | "courseCode" | "title">) {
  return `${s.date}|${s.kind}|${s.courseCode}|${s.title}`;
}

export function buildPlan({
  today,
  prefs,
  progress,
  exams,
  busy = [],
  courses,
  doneMinutes = {},
  skipped = new Set<string>(),
  offDays = [],
}: {
  today: string;
  prefs: StudyPrefs;
  progress: ProgressMap;
  exams: Exam[];
  busy?: Busy[];
  courses: Course[];
  /** session key -> minutes, for sessions marked done */
  doneMinutes?: Record<string, number>;
  /** keys of sessions marked skipped */
  skipped?: Set<string>;
  /** rough days: no studying planned, the work moves to the next days */
  offDays?: string[];
}): Plan {
  const off = new Set(offDays);
  const tasks: Task[] = [];
  // Minutes already done before today, per "kind|course|title".
  const credit = new Map<string, number>();
  for (const [key, min] of Object.entries(doneMinutes)) {
    const [date, ...rest] = key.split("|");
    if (date >= today || !min) continue;
    const id = rest.join("|");
    credit.set(id, (credit.get(id) ?? 0) + min);
  }
  const creditFor = (kind: string, code: string, title: string) => credit.get(`${kind}|${code}|${title}`) ?? 0;

  for (const c of courses) {
    for (const a of c.assignments) {
      const status = progress[progressKey(c.code, a.n)]?.status;
      if (status === "submitted" || status === "skipped" || a.due < today) continue;
      const need = prepMinutes(a.type, a.weight);
      if (!need) continue;
      const until = addDays(a.due, -1) < today ? today : addDays(a.due, -1);
      const title = `${typeLabel[a.type]} ${a.n} ב${c.short}`;
      const sessionTitle = `הכנה ל${title}`;
      const remaining = need - creditFor("assignment", c.code, sessionTitle);
      if (remaining < MIN_CHUNK) continue;
      tasks.push({
        courseCode: c.code,
        kind: "assignment",
        title,
        sessionTitle,
        from: maxIso(today, addDays(a.due, -PREP_WINDOW_DAYS)),
        until,
        deadline: a.due,
        remaining,
      });
    }
  }

  for (const e of nextExams(exams, today)) {
    const title = `בחינה ב${themeOf(courses, e.course_code).short}`;
    const sessionTitle = `חזרה ל${title}`;
    const remaining = EXAM_MINUTES - creditFor("exam", e.course_code, sessionTitle);
    if (remaining < MIN_CHUNK) continue;
    tasks.push({
      courseCode: e.course_code,
      kind: "exam",
      title,
      sessionTitle,
      from: maxIso(today, addDays(e.date, -EXAM_WINDOW_DAYS)),
      until: maxIso(today, addDays(e.date, -1)),
      deadline: e.date,
      remaining,
    });
  }

  const lastAssignment = courses.flatMap((c) => c.assignments.map((a) => a.due)).sort().at(-1) ?? today;
  const horizon = [lastAssignment, ...tasks.map((t) => t.until)].sort().at(-1)!;

  const sessions: Session[] = [];
  const routineLoad = new Map<string, number>(courses.map((c) => [c.code, 0]));
  const examDays = new Set(exams.map((e) => e.date));

  for (let day = today; day <= horizon; day = addDays(day, 1)) {
    const slot = prefs.availability[String(weekday(day))];
    if (!slot || slot.minutes < MIN_CHUNK || examDays.has(day) || off.has(day)) continue;
    // Free time = the study window minus anything already booked that day (tutorials, own blocks).
    const winStart = toMin(slot.start);
    let segments: [number, number][] = [[winStart, winStart + slot.minutes]];
    for (const b of busy.filter((x) => x.date === day)) {
      const bs = toMin(b.start) - BREAK_MINUTES;
      const be = toMin(b.end) + BREAK_MINUTES;
      segments = segments.flatMap(([a, z]): [number, number][] =>
        be <= a || bs >= z ? [[a, z]] : ([[a, Math.min(bs, z)], [Math.max(be, a), z]] as [number, number][]).filter(([x, y]) => y - x >= MIN_CHUNK),
      );
    }
    const freeNow = () => segments.reduce((m, [a, z]) => Math.max(m, z - a), 0);
    let capacity = freeNow();
    const usedToday = new Set<Task>();

    const place = (minutes: number, courseCode: string, kind: SessionKind, title: string) => {
      const seg = segments.find(([a, z]) => z - a >= Math.min(minutes, MIN_CHUNK))!;
      const len = Math.min(minutes, seg[1] - seg[0]);
      const s: Session = { date: day, start: toHHMM(seg[0]), end: toHHMM(seg[0] + len), minutes: len, courseCode, kind, title };
      seg[0] += len + BREAK_MINUTES;
      capacity = freeNow();
      sessions.push(s);
      // Skipped: it stays visible (so it can be undone), but its work is placed again on another day.
      return skipped.has(sessionKey(s)) ? 0 : len;
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
        t.remaining -= place(chunk, t.courseCode, t.kind, t.sessionTitle);
        usedToday.add(t);
      }
    }

    // 3: routine study for the course that has had the least of it so far.
    if (prefs.fill_routine && capacity >= MIN_CHUNK) {
      const code = [...routineLoad.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
      if (code) {
        const used = place(Math.min(prefs.session_minutes, capacity), code, "routine", `לימוד שוטף ב${themeOf(courses, code).short}`);
        routineLoad.set(code, (routineLoad.get(code) ?? 0) + used);
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
