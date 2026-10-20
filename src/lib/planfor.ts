import { buildPlan, type Busy, type Exam, type Plan, type StudyPrefs } from "@/lib/planner";
import { coursesFor, type ProgressMap } from "@/lib/progress";
import { addDays, type Course } from "@/lib/semester";
import { expandRoutines, routineBusy, type Occurrence, type Routine, type RoutineLog } from "@/lib/routines";

interface EventLike {
  date: string;
  start_time: string | null;
  end_time: string | null;
  kind: string;
  cancelled?: boolean;
}

export function busyFromEvents(events: EventLike[]): Busy[] {
  // Optional things (phone tutoring hours, registration dates) and cancelled meetings don't block study time.
  return events
    .filter((e) => e.start_time && e.end_time && e.kind !== "other" && !e.cancelled)
    .map((e) => ({ date: e.date, start: e.start_time!, end: e.end_time! }));
}

/** The plan, shared by the app and the server routes so both always agree. */
export function planFor({
  today,
  prefs,
  progress,
  exams,
  events,
  rows,
  courses,
  routines = [],
  offDays = [],
  extraBusy = [],
}: {
  offDays?: string[];
  /** extra blocked time (e.g. Friday evening in Shabbat rest mode) */
  extraBusy?: Busy[];
  /** Life routines: timed fixed ones that block study are planned around. */
  routines?: Routine[];
  /** The user's courses (without deadline extensions; they're applied here). */
  courses: Course[];
  today: string;
  prefs: StudyPrefs;
  progress: ProgressMap;
  exams: Exam[];
  events: EventLike[];
  rows: { session_key: string; status: string; minutes: number | null }[];
}): Plan {
  return buildPlan({
    today,
    prefs,
    progress,
    exams,
    busy: [...extraBusy, ...busyFromEvents(events), ...routineBusy(routines, today, addDays(today, 240))],
    courses: coursesFor(progress, courses),
    doneMinutes: Object.fromEntries(rows.filter((r) => r.status === "done" && r.minutes).map((r) => [r.session_key, r.minutes!])),
    skipped: new Set(rows.filter((r) => r.status === "skipped").map((r) => r.session_key)),
    offDays,
  });
}

/** Routine occurrences for a date range, placed around events and the study plan. */
export function occurrencesFor({
  routines,
  logs,
  events,
  plan,
  today,
  from,
  to,
  offDays = [],
}: {
  offDays?: string[];
  routines: Routine[];
  logs: RoutineLog[];
  events: EventLike[];
  plan: Plan;
  today: string;
  from: string;
  to: string;
}): Occurrence[] {
  const taken = [
    // Optional slots (kind "other", e.g. phone tutoring hours) stay free for routines too.
    ...events.filter((e) => e.start_time && e.end_time && e.kind !== "other" && !e.cancelled).map((e) => ({ date: e.date, start: e.start_time!, end: e.end_time! })),
    ...plan.sessions.map((s) => ({ date: s.date, start: s.start, end: s.end })),
  ];
  return expandRoutines({ routines, logs, from, to, today, taken, offDays });
}
