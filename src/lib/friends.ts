/** Turns what a friend shares (friend_view) into the numbers shown on their card and page. */
import { defaultPrefs, sessionKey, type Exam, type StudyPrefs } from "@/lib/planner";
import { coursesFor, progressKey, standing, type ProgressMap, type Status } from "@/lib/progress";
import { occurrencesFor, planFor } from "@/lib/planfor";
import { courseFromRow, addDays, semester, type CourseRow } from "@/lib/semester";
import { streak, weekProgress, weekStart, type Routine, type RoutineLog } from "@/lib/routines";

export interface FriendRaw {
  id: string;
  name: string;
  avatar_url: string | null;
  avatar_emoji?: string | null;
  avatar_color?: string | null;
  bio?: string | null;
  program?: string | null;
  study_year?: string | null;
  weekly_goal_minutes?: number | null;
  member_since?: string;
  cheers_received?: number;
  friends_count?: number;
  share: { courses: boolean; progress: boolean; grades: boolean; study: boolean; schedule: "none" | "busy" | "details"; routines: boolean };
  courses: CourseRow[];
  progress: { course_code: string; semester: string; n: string; status: Status; grade?: number | null; due_override?: string | null }[];
  exams: (Exam & { semester: string })[];
  study: Record<string, number>;
  schedule: "none" | "busy" | "details";
  prefs: StudyPrefs | null;
  events: { id: string; date: string; start_time: string | null; end_time: string | null; title: string; kind: string; cancelled?: boolean }[];
  session_status: Record<string, "done" | "skipped">;
  routines: Routine[];
  routine_logs: RoutineLog[];
}

export interface Block {
  date: string;
  start: string;
  end: string;
  title: string; // "עסוק/ה" when only busy times are shared
  kind: "study" | "event" | "routine";
}

export function summarize(f: FriendRaw, today: string) {
  const progress: ProgressMap = Object.fromEntries(
    f.progress
      .filter((p) => p.semester === semester.semester)
      .map((p) => [progressKey(p.course_code, p.n), { status: p.status, grade: p.grade ?? null, due: p.due_override ?? null }]),
  );
  const base = f.courses.map(courseFromRow);
  const courses = coursesFor(progress, base).map((c) => ({ course: c, st: standing(c, progress, today) }));

  // Study time: this week (from Sunday) and the week before.
  const ws = weekStart(today);
  let week = 0;
  let lastWeek = 0;
  for (const [key, min] of Object.entries(f.study ?? {})) {
    const d = key.split("|")[0];
    if (d >= ws && d <= today) week += min;
    else if (d >= addDays(ws, -7) && d < ws) lastWeek += min;
  }

  const routines = (f.routines ?? []).filter((r) => r.active).map((r) => ({
    routine: r,
    progress: weekProgress(r, f.routine_logs, today),
    streak: streak(r, f.routine_logs, today),
  }));

  // Schedule for the coming week.
  let blocks: Block[] = [];
  if (f.schedule !== "none" && f.prefs !== undefined) {
    const rows = Object.entries(f.session_status ?? {}).map(([session_key, status]) => ({ session_key, status, minutes: f.study?.[session_key] ?? null }));
    const exams = f.exams.filter((e) => e.semester === semester.semester);
    const plan = planFor({ today, prefs: f.prefs ?? defaultPrefs, progress, exams, events: f.events, rows, courses: base, routines: f.routines ?? [] });
    const detail = f.schedule === "details";
    const to = addDays(today, 6);
    blocks = [
      ...plan.sessions
        .filter((s) => s.date >= today && s.date <= to && f.session_status?.[sessionKey(s)] !== "skipped")
        .map((s) => ({ date: s.date, start: s.start, end: s.end, title: detail ? s.title : "לימוד", kind: "study" as const })),
      ...f.events
        .filter((e) => e.date >= today && e.date <= to && e.start_time && e.end_time && !e.cancelled && e.kind !== "other")
        .map((e) => ({ date: e.date, start: e.start_time!, end: e.end_time!, title: detail ? e.title : "עסוק/ה", kind: "event" as const })),
      ...occurrencesFor({ routines: f.routines ?? [], logs: f.routine_logs ?? [], events: f.events, plan, today, from: today, to })
        .filter((o) => o.start && o.end && o.end > o.start && o.category !== "sleep")
        .map((o) => ({ date: o.date, start: o.start!, end: o.end!, title: detail ? `${o.emoji} ${o.title}` : "עסוק/ה", kind: "routine" as const })),
    ].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  }

  const nextExam = f.exams.filter((e) => e.semester === semester.semester && e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  return { courses, week, lastWeek, routines, blocks, nextExam };
}
