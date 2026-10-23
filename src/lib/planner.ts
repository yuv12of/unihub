import { duration } from "@/lib/time";
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
  /** study hours a week to aim for: routine study fills each week up to it (null = one session a day) */
  weekly_goal_minutes?: number | null;
  /** open "stuck" points per course: those courses get more routine study */
  focus?: Record<string, number> | null;
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
  /** stable id inside the course ("a01", "exam", "routine"): the key survives renaming a course */
  ref?: string;
  /** why routine study went to this course ("ממ״ן 12 בעוד 5 ימים") */
  why?: string;
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
/** Exam period: this many days before an exam, spare study time goes to that course. */
const EXAM_PERIOD_DAYS = 14;
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
  ref: string;
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

/** The task a session belongs to: "a01-2" → "a01". */
export const baseRef = (ref: string) => ref.replace(/-\d+$/, "");

/** Stable identity for a planned session, used to remember done / skipped. */
export function sessionKey(s: Pick<Session, "date" | "kind" | "courseCode" | "title" | "ref">) {
  return `${s.date}|${s.kind}|${s.courseCode}|${s.ref ?? s.title}`;
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
    // "a01-2" (a second session that day) counts toward "a01"
    const id = baseRef(rest.join("|"));
    credit.set(id, (credit.get(id) ?? 0) + min);
  }
  const creditFor = (kind: string, code: string, ref: string) => credit.get(`${kind}|${code}|${ref}`) ?? 0;

  for (const c of courses) {
    for (const a of c.assignments) {
      const status = progress[progressKey(c.code, a.n)]?.status;
      if (status === "submitted" || status === "skipped" || a.due < today) continue;
      const need = prepMinutes(a.type, a.weight);
      if (!need) continue;
      const until = addDays(a.due, -1) < today ? today : addDays(a.due, -1);
      const title = `${typeLabel[a.type]} ${a.n} ב${c.short}`;
      const sessionTitle = `הכנה ל${title}`;
      const ref = `a${a.n}`;
      const remaining = need - creditFor("assignment", c.code, ref);
      if (remaining < MIN_CHUNK) continue;
      tasks.push({
        courseCode: c.code,
        kind: "assignment",
        title,
        sessionTitle,
        ref,
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
    const remaining = EXAM_MINUTES - creditFor("exam", e.course_code, "exam");
    if (remaining < MIN_CHUNK) continue;
    tasks.push({
      courseCode: e.course_code,
      kind: "exam",
      title,
      sessionTitle,
      ref: "exam",
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

  // Weekly goal: study minutes per week (Sunday start), counting what was already done this week.
  const goal = prefs.weekly_goal_minutes && prefs.weekly_goal_minutes > 0 ? prefs.weekly_goal_minutes : null;
  const weekOf = (d: string) => addDays(d, -weekday(d));
  const weekMinutes = new Map<string, number>();
  for (const [key, min] of Object.entries(doneMinutes)) {
    const date = key.split("|")[0];
    if (date < today && date >= weekOf(today) && min) weekMinutes.set(weekOf(today), (weekMinutes.get(weekOf(today)) ?? 0) + min);
  }
  const studyDay = (d: string) => {
    const slot = prefs.availability[String(weekday(d))];
    return !!slot && slot.minutes >= MIN_CHUNK && !examDays.has(d) && !off.has(d);
  };
  /**
   * How much a course needs routine study on a day: a deadline in the next two weeks and open
   * "stuck" points raise its share (weight 1 = an even split).
   */
  const need = (code: string, d: string): { weight: number; why: string | null } => {
    const c = courses.find((x) => x.code === code);
    let weight = 1;
    const why: string[] = [];
    const next = c?.assignments
      .filter((a) => a.due >= d && prepMinutes(a.type, a.weight) > 0)
      .filter((a) => {
        const st = progress[progressKey(code, a.n)]?.status;
        return st !== "submitted" && st !== "skipped";
      })
      .sort((a, b) => a.due.localeCompare(b.due))[0];
    if (next) {
      const days = Math.round((Date.parse(next.due + "T00:00:00Z") - Date.parse(d + "T00:00:00Z")) / 86_400_000);
      if (days <= 14) {
        weight += (1.5 * (15 - days)) / 15;
        why.push(`${typeLabel[next.type]} ${next.n} ${days === 0 ? "היום" : days === 1 ? "מחר" : `בעוד ${days} ימים`}`);
      }
    }
    const stuck = Math.min(3, prefs.focus?.[code] ?? 0);
    if (stuck) {
      weight += 0.35 * stuck;
      why.push(stuck === 1 ? "נקודה אחת שנתקעת בה" : `${stuck} נקודות שנתקעת בהן`);
    }
    return { weight, why: why.length ? why.join(" · ") : null };
  };

  /** This day's share of what the week still needs. */
  const shareFor = (d: string) => {
    if (!goal) return 0;
    let left = 0;
    for (let x = d; x <= addDays(weekOf(d), 6); x = addDays(x, 1)) if (studyDay(x)) left++;
    return left ? Math.ceil(Math.max(0, goal - (weekMinutes.get(weekOf(d)) ?? 0)) / left) : 0;
  };

  for (let day = today; day <= horizon; day = addDays(day, 1)) {
    const slot = prefs.availability[String(weekday(day))];
    if (!slot || slot.minutes < MIN_CHUNK || examDays.has(day) || off.has(day)) continue;
    // Free time = the study window minus anything already booked that day (tutorials, own blocks).
    const winStart = toMin(slot.start);
    // A window that runs past midnight stops at midnight (sessions never spill into the next date).
    let segments: [number, number][] = [[winStart, Math.min(winStart + slot.minutes, 24 * 60 - 1)]];
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
    const share = shareFor(day);
    let placedToday = 0;

    const place = (minutes: number, courseCode: string, kind: SessionKind, title: string, ref: string) => {
      const seg = segments.find(([a, z]) => z - a >= Math.min(minutes, MIN_CHUNK))!;
      const len = Math.min(minutes, seg[1] - seg[0]);
      // A second session of the same task on one day gets its own key ("a01-2"), so ticking one doesn't tick both.
      let key = ref;
      for (let n = 2; sessions.some((x) => x.date === day && x.kind === kind && x.courseCode === courseCode && x.ref === key); n++) key = `${ref}-${n}`;
      const s: Session = { date: day, start: toHHMM(seg[0]), end: toHHMM(seg[0] + len), minutes: len, courseCode, kind, title, ref: key };
      seg[0] += len + BREAK_MINUTES;
      capacity = freeNow();
      sessions.push(s);
      // Skipped: it stays visible (so it can be undone), but its work is placed again on another day.
      if (skipped.has(sessionKey(s))) return 0;
      placedToday += len;
      weekMinutes.set(weekOf(day), (weekMinutes.get(weekOf(day)) ?? 0) + len);
      return len;
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
        t.remaining -= place(chunk, t.courseCode, t.kind, t.sessionTitle, t.ref);
        usedToday.add(t);
      }
    }

    // 3: routine study for the course that has had the least of it so far.
    //    Exam period: in the two weeks before an exam, the free time goes to that course instead.
    if (prefs.fill_routine && capacity >= MIN_CHUNK) {
      const examSoon = exams
        .filter((e) => e.date > day && e.date <= addDays(day, EXAM_PERIOD_DAYS))
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      if (examSoon) {
        for (let k = 0; capacity >= MIN_CHUNK && k < 4; k++) {
          const used = place(Math.min(prefs.session_minutes, capacity), examSoon.course_code, "routine", `חזרה לבחינה ב${themeOf(courses, examSoon.course_code).short}`, `exam${k}`);
          if (!used) break;
        }
      } else {
        // With a weekly goal: keep adding sessions (rotating courses) until today's share of the goal
        // is planned. Without one: a single session.
        const perCourse = new Map<string, number>();
        const needs = new Map(courses.map((c) => [c.code, need(c.code, day)]));
        for (let k = 0; capacity >= MIN_CHUNK && k < 8; k++) {
          if (goal ? placedToday >= share : k > 0) break;
          // The course furthest behind its fair share gets the next session; the share grows with need.
          const code = [...routineLoad.entries()].sort(
            (a, b) => a[1] / needs.get(a[0])!.weight - b[1] / needs.get(b[0])!.weight,
          )[0]?.[0];
          if (!code) break;
          const n = (perCourse.get(code) ?? 0) + 1;
          perCourse.set(code, n);
          const want = goal ? Math.max(MIN_CHUNK, Math.min(prefs.session_minutes, share - placedToday)) : prefs.session_minutes;
          const len = Math.min(want, capacity);
          const used = place(len, code, "routine", `לימוד שוטף ב${themeOf(courses, code).short}`, n === 1 ? "routine" : `routine${n}`);
          const why = needs.get(code)!.why;
          if (why) sessions[sessions.length - 1].why = why;
          // a skipped session still took its slot; count it so the rotation moves on
          routineLoad.set(code, (routineLoad.get(code) ?? 0) + (used || len));
        }
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

export const minutesLabel = (min: number) => duration(min);

export function daysUntil(today: string, iso: string) {
  return daysBetween(today, iso);
}
