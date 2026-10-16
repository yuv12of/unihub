import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { semester, type Course } from "@/lib/semester";

export type Status = "todo" | "in_progress" | "submitted" | "skipped";
export interface Progress {
  status: Status;
  grade: number | null;
  /** Deadline moved for this user (extension announced by mail). */
  due?: string | null;
}
export type ProgressMap = Record<string, Progress>;

export const progressKey = (code: string, n: string) => `${code}-${n}`;

/** The signed-in user's progress for the current semester (empty when signed out). */
export async function getProgress(): Promise<ProgressMap> {
  if (!supabaseEnabled) return {};
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assignment_progress")
    .select("course_code, n, status, grade, due_override")
    .eq("semester", semester.semester);
  if (error || !data) return {};
  return Object.fromEntries(
    data.map((r) => [progressKey(r.course_code, r.n), { status: r.status as Status, grade: r.grade, due: r.due_override }]),
  );
}

export interface CourseStanding {
  earned: number; // weight of submitted assignments
  needed: number; // weight still required to reach the minimum
  open: number; // weight of assignments still open (not submitted/skipped, deadline not passed)
  slack: number; // how much open weight can be skipped and still reach the minimum
  submittedCount: number;
  average: number | null; // weighted average of graded assignments
  atRisk: boolean;
}

export function standing(course: Course, progress: ProgressMap, today: string): CourseStanding {
  let earned = 0;
  let open = 0;
  let submittedCount = 0;
  let gradeSum = 0;
  let gradeWeight = 0;
  for (const a of course.assignments) {
    const p = progress[progressKey(course.code, a.n)];
    if (p?.status === "submitted") {
      earned += a.weight;
      submittedCount++;
      if (p.grade != null) {
        gradeSum += p.grade * a.weight;
        gradeWeight += a.weight;
      }
    } else if (p?.status !== "skipped" && a.due >= today) {
      open += a.weight;
    }
  }
  const needed = Math.max(0, course.assignmentWeight.min - earned);
  return {
    earned,
    needed,
    open,
    slack: open - needed,
    submittedCount,
    average: gradeWeight ? Math.round(gradeSum / gradeWeight) : null,
    atRisk: open < needed,
  };
}

/** The semester's courses with this user's deadline extensions applied. */
export function coursesFor(progress: ProgressMap, courses: Course[] = semester.courses): Course[] {
  return courses.map((c) => ({
    ...c,
    assignments: c.assignments.map((a) => {
      const due = progress[progressKey(c.code, a.n)]?.due;
      return due && due !== a.due ? { ...a, due, originalDue: a.due } : a;
    }),
  }));
}
