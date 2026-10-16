import { buildPlan, type Busy, type Exam, type Plan, type StudyPrefs } from "@/lib/planner";
import { coursesFor, type ProgressMap } from "@/lib/progress";

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
}: {
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
    busy: busyFromEvents(events),
    courses: coursesFor(progress),
    doneMinutes: Object.fromEntries(rows.filter((r) => r.status === "done" && r.minutes).map((r) => [r.session_key, r.minutes!])),
    skipped: new Set(rows.filter((r) => r.status === "skipped").map((r) => r.session_key)),
  });
}
