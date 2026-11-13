import { cache } from "react";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayInIsrael } from "@/lib/semester";
import type { Goal, GoalData, GoalLog, Milestone, Task } from "@/lib/goalMeta";

export * from "@/lib/goalMeta";

const EMPTY: GoalData = { goals: [], milestones: [], tasks: [], logs: [] };

/** Everything the goals pages draw from, in one round. Empty (not an error) before the tables exist. */
type Db = Pick<Awaited<ReturnType<typeof createClient>>, "from">;

/** Loads one user's goals. With the signed-in client RLS already limits rows; the server (admin) client passes userId. */
export async function loadGoals(sb: Db, userId?: string): Promise<GoalData> {
  // Without a userId the filter is a no-op match on nothing, so both clients share one code path.
  const who = userId ? { user_id: userId } : {};
  const [g, m, t, l] = await Promise.all([
    sb.from("goals").select("id, title, color, area, status, why, started_on, due, progress_mode, start_value, target_value, unit, weekly_minutes, routine_id, sort, created_at, done_at").match(who).order("sort").order("created_at"),
    sb.from("goal_milestones").select("id, goal_id, title, due, done_at, sort").match(who).order("sort").order("created_at"),
    sb.from("tasks").select("id, goal_id, title, due, minutes, done_at, sort, created_at").match(who).order("sort").order("created_at").limit(2000),
    sb.from("goal_logs").select("id, goal_id, date, value, percent, minutes, note").match(who).order("date").limit(5000),
  ]);
  if (g.error) return EMPTY; // also the case before the migration is applied
  const num = (x: unknown) => (x == null ? null : Number(x));
  return {
    goals: (g.data ?? []).map((r) => ({ ...r, start_value: num(r.start_value), target_value: num(r.target_value) })) as Goal[],
    milestones: (m.data ?? []) as Milestone[],
    tasks: (t.data ?? []) as Task[],
    logs: (l.data ?? []).map((r) => ({ ...r, value: num(r.value) })) as GoalLog[],
  };
}

/** Everything the goals pages draw from, in one round. Empty (not an error) before the tables exist. */
export const getGoals = cache(async (): Promise<GoalData> => {
  if (!supabaseEnabled) return process.env.UNIHUB_DEMO ? demoGoals(todayInIsrael()) : EMPTY;
  return loadGoals(await createClient());
});

/** Local design previews only (env UNIHUB_DEMO, no database). */
function demoGoals(today: string): GoalData {
  const at = (n: number) => addDays(today, n);
  const ts = (n: number) => at(n) + "T10:00:00Z";
  const g = (id: string, p: Partial<Goal>): Goal => ({
    id, title: id, color: "blue", area: "personal", status: "active", why: null, started_on: at(-43), due: null, progress_mode: "tasks",
    start_value: null, target_value: null, unit: null, weekly_minutes: 0, routine_id: null, sort: 0, created_at: ts(-43), done_at: null, ...p,
  });
  const task = (id: string, goal: string | null, title: string, done: number | null, sort: number, due: number | null = null): Task => ({ id, goal_id: goal, title, due: due == null ? null : at(due), minutes: null, done_at: done == null ? null : ts(done), sort, created_at: ts(-43) });
  return {
    goals: [
      g("site", { title: "אתר תיק עבודות", area: "work", color: "blue", due: at(23), why: "להתחיל לקבל פניות לעבודה" }),
      g("run", { title: "ריצת 10 ק״מ", area: "health", color: "green", progress_mode: "number", start_value: 0, target_value: 10, unit: "ק״מ", due: at(63) }),
      g("save", { title: "חיסכון לטיול", area: "money", color: "orange", progress_mode: "number", start_value: 0, target_value: 12000, unit: "₪" }),
      g("lang", { title: "ספרדית בסיסית", area: "personal", color: "purple", status: "idea", progress_mode: "milestones" }),
      g("book", { title: "לסיים את הספר", area: "personal", color: "amber", status: "paused", progress_mode: "manual" }),
      g("desk", { title: "פינת עבודה בבית", area: "home", color: "teal", status: "done", done_at: ts(-20), started_on: at(-80), created_at: ts(-80) }),
    ],
    milestones: [
      { id: "m1", goal_id: "site", title: "עיצוב", due: at(-32), done_at: ts(-33), sort: 0 },
      { id: "m2", goal_id: "site", title: "עמוד הבית", due: at(-11), done_at: ts(-12), sort: 1 },
      { id: "m3", goal_id: "site", title: "שלושה פרויקטים בפנים", due: at(9), done_at: null, sort: 2 },
      { id: "m4", goal_id: "site", title: "העלאה לאוויר", due: at(23), done_at: null, sort: 3 },
      { id: "m5", goal_id: "lang", title: "300 המילים הנפוצות", due: null, done_at: null, sort: 0 },
    ],
    tasks: [
      task("t1", "site", "לבחור תבנית", -38, 0), task("t2", "site", "לכתוב טקסט לעמוד הבית", -30, 1), task("t3", "site", "לצלם מסכים לפרויקט הראשון", -19, 2),
      task("t4", "site", "להעלות את הפרויקט הראשון", -12, 3), task("t5", "site", "טופס יצירת קשר", -3, 4),
      task("t6", "site", "לכתוב את עמוד ״עליי״", null, 5, 2), task("t7", "site", "צילומי מסך לפרויקט השני", null, 6), task("t8", "site", "לחבר דומיין", null, 7),
      task("t9", "desk", "שולחן", -40, 0), task("t10", "desk", "תאורה", -20, 1),
      task("i1", null, "לחדש דרכון", null, 0, 0), task("i2", null, "לקבוע תור לרופא שיניים", null, 1),
    ],
    logs: [
      ...[[-40, 1], [-33, 2], [-26, 2.5], [-17, 3], [-9, 3.5], [-2, 4]].map(([d, v], i) => ({ id: `r${i}`, goal_id: "run", date: at(d), value: v, percent: null, minutes: null, note: null })),
      ...[[-41, 1000], [-27, 2000], [-12, 3000]].map(([d, v], i) => ({ id: `s${i}`, goal_id: "save", date: at(d), value: v, percent: null, minutes: null, note: null })),
      { id: "b0", goal_id: "book", date: at(-30), value: null, percent: 35, minutes: null, note: null },
    ],
  };
}
