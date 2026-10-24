/**
 * A scrubbed copy of the owner's real setup as of 23.10.2026 (titles replaced, ids made up):
 * study prefs, the 17 routines (free evening on Wednesday only), the three 2027א courses with
 * their real deadlines, and the real tutorial nights from Sheilta.
 */
import type { StudyPrefs } from "@/lib/planner";
import type { Routine, RoutineCategory, TimeWindow } from "@/lib/routines";
import { courseFromRow, type AssignmentType } from "@/lib/semester";

export const prefs: StudyPrefs = {
  availability: {
    "0": { start: "08:45", minutes: 405 },
    "1": { start: "08:45", minutes: 405 },
    "2": { start: "08:45", minutes: 405 },
    "3": { start: "08:45", minutes: 405 },
    "4": { start: "08:45", minutes: 405 },
    "5": { start: "08:45", minutes: 0 },
    "6": { start: "20:00", minutes: 0 },
  },
  session_minutes: 90,
  fill_routine: true,
  weekly_goal_minutes: 1200,
  focus: {},
} as StudyPrefs;

const R = (
  id: string,
  title: string,
  category: RoutineCategory,
  mode: "fixed" | "flexible",
  days: number[],
  start: string | null,
  minutes: number,
  per_week: number | null,
  time_window: TimeWindow,
  blocks_study: boolean,
): Routine => ({
  id,
  user_id: "u",
  title,
  emoji: null,
  category,
  mode,
  days,
  start_time: start,
  minutes,
  per_week,
  time_window,
  blocks_study,
  active: true,
  starts_on: "2026-10-25",
  overrides: {},
});

export const routines: Routine[] = [
  R("lunch", "lunch", "meal", "fixed", [0, 1, 2, 3, 4, 5, 6], "13:00", 45, null, "any", true),
  R("dinner", "dinner", "meal", "fixed", [0, 1, 2, 3, 4], "17:30", 30, null, "any", true),
  R("wdinner", "weekend dinner", "meal", "fixed", [5, 6], "19:30", 60, null, "any", true),
  R("free", "free evening", "hobby", "fixed", [3], "20:00", 150, null, "any", true),
  R("plan", "week planning", "habit", "fixed", [6], "20:30", 30, null, "any", true),
  R("workout", "workout", "sport", "flexible", [], null, 60, 3, "afternoon", true),
  R("cards", "flashcards", "habit", "flexible", [], null, 15, 6, "evening", false),
  R("social", "friends", "social", "flexible", [], null, 180, 1, "evening", true),
  R("sleep", "sleep", "sleep", "fixed", [0, 1, 2, 3, 4, 5, 6], "00:00", 480, null, "any", true),
  R("wake", "wake", "health", "fixed", [0, 1, 2, 3, 4], "08:00", 20, null, "any", true),
  R("bfast", "breakfast", "meal", "fixed", [0, 1, 2, 3, 4], "08:20", 25, null, "any", true),
  R("wind", "wind-down", "habit", "fixed", [0, 1, 2, 3, 4, 5, 6], "23:15", 45, null, "any", true),
  R("satam", "sat morning", "health", "fixed", [6], "09:00", 30, null, "any", true),
  R("satbf", "sat breakfast", "meal", "fixed", [6], "09:30", 30, null, "any", true),
  R("chores", "chores", "chore", "fixed", [5], "09:15", 195, null, "any", true),
  R("friwake", "fri wake", "health", "fixed", [5], "08:30", 20, null, "any", true),
  R("fribf", "fri breakfast", "meal", "fixed", [5], "08:50", 25, null, "any", true),
];

const asg: [string, string, AssignmentType, number, string][] = [
  ["20109", "01", "file", 3, "2026-11-19"], ["20109", "02", "file", 3, "2026-12-10"], ["20109", "03", "online", 1, "2026-12-17"],
  ["20109", "04", "file", 4, "2026-12-31"], ["20109", "05", "online", 1, "2027-01-07"], ["20109", "06", "file", 4, "2027-01-21"],
  ["20109", "07", "file", 3, "2027-02-04"], ["20109", "08", "online", 1, "2027-02-06"],
  ["20407", "01", "file", 5, "2026-11-12"], ["20407", "02", "file", 5, "2026-11-26"], ["20407", "03", "file", 5, "2026-12-10"],
  ["20407", "04", "file", 5, "2026-12-31"], ["20407", "05", "file", 5, "2027-01-21"], ["20407", "06", "participation", 5, "2027-02-07"],
  ["20474", "01", "file", 2, "2026-11-12"], ["20474", "02", "online", 1, "2026-11-19"], ["20474", "03", "file", 2, "2026-11-26"],
  ["20474", "04", "file", 2, "2026-12-10"], ["20474", "05", "online", 1, "2026-12-17"], ["20474", "06", "file", 2, "2026-12-27"],
  ["20474", "07", "online", 1, "2027-01-03"], ["20474", "08", "file", 3, "2027-01-10"], ["20474", "09", "online", 1, "2027-01-17"],
  ["20474", "10", "file", 2, "2027-01-24"], ["20474", "11", "file", 3, "2027-02-07"],
];

export const courses = (
  [
    ["20109", "Linear Algebra 1", "blue", "Algebra"],
    ["20474", "Calculus 1", "green", "Calculus"],
    ["20407", "Data Structures", "purple", "DS"],
  ] as const
).map(([code, name, color, short]) =>
  courseFromRow({
    code,
    name,
    color,
    short,
    min_weight: 10,
    max_weight: 20,
    assignments: asg.filter((a) => a[0] === code).map(([, n, type, weight, due]) => ({ n, type, weight, due })),
  }),
);

export interface Ev {
  date: string;
  start_time: string | null;
  end_time: string | null;
  kind: string;
  title: string;
  source: string;
  cancelled: boolean;
}
const E = (date: string, start: string | null, end: string | null, kind: string, source = "sheilta"): Ev => ({
  date,
  start_time: start,
  end_time: end,
  kind,
  title: "",
  source,
  cancelled: false,
});

export const events: Ev[] = [
  E("2026-10-25", "18:00", "21:00", "tutorial"),
  E("2026-10-26", "18:00", "20:00", "tutorial"),
  E("2026-10-26", "19:00", "20:00", "other"),
  E("2026-11-01", "00:00", null, "other"),
  E("2026-11-02", "18:00", "20:00", "tutorial"),
  E("2026-11-03", "16:00", "22:00", "custom", "manual"),
  E("2026-11-03", "18:00", "21:00", "tutorial"),
  E("2026-11-08", "18:00", "21:00", "tutorial"),
  E("2026-11-09", "18:00", "20:00", "tutorial"),
  E("2026-11-10", "18:00", "21:00", "tutorial"),
  E("2026-11-16", "18:00", "20:00", "tutorial"),
];
