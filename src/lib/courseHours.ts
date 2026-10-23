/**
 * Study time for one course: this week's hours (done + planned) and, per open assignment, how much
 * prep is done, scheduled, and still missing. Pure, from the plan and the session log.
 */
import { prepMinutes, sessionKey, type Plan } from "@/lib/planner";
import { progressKey, type ProgressMap } from "@/lib/progress";
import { addDays, typeLabel, type Course } from "@/lib/semester";

export interface AssignmentHours {
  n: string;
  label: string;
  due: string;
  need: number;
  done: number;
  scheduled: number;
  missing: number;
}

export interface CourseHours {
  weekDone: number;
  weekPlanned: number;
  /** hours done per week, oldest first (last 8 weeks) */
  history: { week: string; minutes: number }[];
  assignments: AssignmentHours[];
  missing: number;
}

const weekStart = (d: string) => addDays(d, -new Date(d + "T00:00:00Z").getUTCDay());

export function courseHours({
  course,
  plan,
  rows,
  progress,
  today,
}: {
  course: Course;
  plan: Plan;
  rows: { session_key: string; status: string; minutes: number | null }[];
  progress: ProgressMap;
  today: string;
}): CourseHours {
  const code = course.code;
  const ws = weekStart(today);
  const done = rows.filter((r) => r.status === "done" && r.minutes && r.session_key.split("|")[2] === code);
  const doneKeys = new Set(rows.map((r) => r.session_key));
  const weekDone = done.filter((r) => r.session_key.slice(0, 10) >= ws && r.session_key.slice(0, 10) <= addDays(ws, 6)).reduce((n, r) => n + r.minutes!, 0);
  const weekPlanned = plan.sessions
    .filter((s) => s.courseCode === code && s.date >= today && s.date <= addDays(ws, 6) && !doneKeys.has(sessionKey(s)))
    .reduce((n, s) => n + s.minutes, 0);

  const history = Array.from({ length: 8 }, (_, i) => {
    const w = addDays(ws, -7 * (7 - i));
    const minutes = done.filter((r) => weekStart(r.session_key.slice(0, 10)) === w).reduce((n, r) => n + r.minutes!, 0);
    return { week: w, minutes };
  });

  const assignments: AssignmentHours[] = [];
  for (const a of course.assignments) {
    const st = progress[progressKey(code, a.n)]?.status;
    if (st === "submitted" || st === "skipped" || a.due < today) continue;
    const need = prepMinutes(a.type, a.weight);
    if (!need) continue;
    const ref = `a${a.n}`;
    const d = done.filter((r) => r.session_key.split("|")[1] === "assignment" && r.session_key.split("|")[3] === ref).reduce((n, r) => n + r.minutes!, 0);
    const scheduled = plan.sessions
      .filter((s) => s.courseCode === code && s.kind === "assignment" && s.ref === ref && s.date >= today && !doneKeys.has(sessionKey(s)))
      .reduce((n, s) => n + s.minutes, 0);
    assignments.push({ n: a.n, label: `${typeLabel[a.type]} ${a.n}`, due: a.due, need, done: d, scheduled, missing: Math.max(0, need - d - scheduled) });
  }
  return { weekDone, weekPlanned, history, assignments, missing: assignments.reduce((n, a) => n + a.missing, 0) };
}
