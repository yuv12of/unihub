"use server";

import { refresh } from "next/cache";
import { action, must } from "@/app/guard";
import { AREAS, COLORS, MODES, STATUSES, type GoalArea, type GoalStatus, type ProgressMode } from "@/lib/goalMeta";
import { todayInIsrael } from "@/lib/semester";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (s?: string | null) => (s && DATE.test(s) ? s : null);
const text = (s: string | null | undefined, max: number) => (s ?? "").trim().slice(0, max);
const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(-1e9, Math.min(1e9, n)) : null);

export interface GoalInput {
  title: string;
  area?: GoalArea;
  color?: string;
  mode?: ProgressMode;
  start?: number | null;
  target?: number | null;
  unit?: string;
  due?: string | null;
  why?: string;
  status?: GoalStatus;
  /** first tasks (tasks mode) or milestones (milestones mode), one per line */
  steps?: string[];
}

export async function createGoal(input: GoalInput) {
  return action("createGoal", async ({ supabase: sb, userId: uid }) => {
    const title = text(input.title, 80);
    if (!title) throw new Error("איך קוראים למטרה?");
    const mode: ProgressMode = input.mode && input.mode in MODES ? input.mode : "tasks";
    const target = num(input.target);
    const start = num(input.start) ?? 0;
    if (mode === "number" && (target == null || target === start)) throw new Error("צריך מספר יעד ששונה מנקודת ההתחלה");
    const id = crypto.randomUUID();
    const today = todayInIsrael();
    must(
      await sb.from("goals").insert({
        id,
        user_id: uid,
        title,
        area: input.area && input.area in AREAS ? input.area : "personal",
        color: COLORS.includes(input.color as (typeof COLORS)[number]) ? input.color : "blue",
        status: input.status === "idea" ? "idea" : "active",
        why: text(input.why, 300) || null,
        started_on: today,
        due: date(input.due),
        progress_mode: mode,
        start_value: mode === "number" ? start : null,
        target_value: mode === "number" ? target : null,
        unit: mode === "number" ? text(input.unit, 12) || null : null,
        sort: Math.floor(Date.now() / 1000),
      }),
    );
    const steps = (input.steps ?? []).map((s) => text(s, 140)).filter(Boolean).slice(0, 30);
    if (steps.length && mode === "milestones") must(await sb.from("goal_milestones").insert(steps.map((t, i) => ({ user_id: uid, goal_id: id, title: t, sort: i }))));
    else if (steps.length) must(await sb.from("tasks").insert(steps.map((t, i) => ({ user_id: uid, goal_id: id, title: t, sort: i }))));
    refresh();
    return id;
  });
}

export async function updateGoal(id: string, patch: { title?: string; area?: GoalArea; color?: string; why?: string; due?: string | null; status?: GoalStatus; target?: number | null; unit?: string }) {
  return action("updateGoal", async ({ supabase: sb, userId: uid }) => {
    const { data: g } = await sb.from("goals").select("title, status, start_value, progress_mode, routine_id, weekly_minutes").match({ id, user_id: uid }).maybeSingle();
    if (!g) throw new Error("לא נמצא");
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row.title = text(patch.title, 80) || g.title;
    if (patch.area !== undefined && patch.area in AREAS) row.area = patch.area;
    if (patch.color !== undefined && COLORS.includes(patch.color as (typeof COLORS)[number])) row.color = patch.color;
    if (patch.why !== undefined) row.why = text(patch.why, 300) || null;
    if (patch.due !== undefined) row.due = date(patch.due);
    if (patch.unit !== undefined) row.unit = text(patch.unit, 12) || null;
    if (patch.target !== undefined && g.progress_mode === "number") {
      const t = num(patch.target);
      if (t == null || t === Number(g.start_value ?? 0)) throw new Error("צריך מספר יעד ששונה מנקודת ההתחלה");
      row.target_value = t;
    }
    if (patch.status !== undefined && patch.status in STATUSES && patch.status !== g.status) {
      row.status = patch.status;
      row.done_at = patch.status === "done" ? new Date().toISOString() : null;
    }
    if (Object.keys(row).length) must(await sb.from("goals").update(row).match({ id, user_id: uid }));
    // the goal's calendar routine follows it: same name, resting while the goal isn't active
    if (g.routine_id && (row.status !== undefined || row.title !== undefined)) {
      const r: Record<string, unknown> = {};
      if (row.title !== undefined) r.title = row.title;
      if (row.status !== undefined) r.active = row.status === "active" && (g.weekly_minutes ?? 0) > 0;
      await sb.from("routines").update(r).match({ id: g.routine_id, user_id: uid });
    }
    refresh();
  });
}

export async function deleteGoal(id: string) {
  return action("deleteGoal", async ({ supabase: sb, userId: uid }) => {
    const { data: g } = await sb.from("goals").select("routine_id").match({ id, user_id: uid }).maybeSingle();
    must(await sb.from("goals").delete().match({ id, user_id: uid }));
    if (g?.routine_id) await sb.from("routines").delete().match({ id: g.routine_id, user_id: uid });
    refresh();
  });
}

/** A new number (₪ saved, km run) or a manual percent for today; one log per goal per day. */
export async function logGoal(id: string, input: { value?: number; percent?: number; note?: string; date?: string }) {
  return action("logGoal", async ({ supabase: sb, userId: uid }) => {
    const { data: g } = await sb.from("goals").select("progress_mode").match({ id, user_id: uid }).maybeSingle();
    if (!g) throw new Error("לא נמצא");
    const today = todayInIsrael();
    const day = date(input.date) && input.date! <= today ? input.date! : today;
    const row: Record<string, unknown> = { user_id: uid, goal_id: id, date: day, note: text(input.note, 200) || null };
    if (g.progress_mode === "number") {
      const v = num(input.value);
      if (v == null) throw new Error("צריך מספר");
      row.value = v;
    } else if (g.progress_mode === "manual") {
      const p = num(input.percent);
      if (p == null) throw new Error("צריך אחוז");
      row.percent = Math.max(0, Math.min(100, Math.round(p)));
    } else throw new Error("המטרה הזו מתקדמת לפי משימות או אבני דרך");
    must(await sb.from("goal_logs").delete().match({ goal_id: id, user_id: uid, date: day }).is("minutes", null));
    must(await sb.from("goal_logs").insert(row));
    refresh();
  });
}

export async function deleteGoalLog(id: string) {
  return action("deleteGoalLog", async ({ supabase: sb, userId: uid }) => {
    must(await sb.from("goal_logs").delete().match({ id, user_id: uid }));
    refresh();
  });
}

/** goalId null = a plain task with no goal. */
export async function addTask(goalId: string | null, title: string, due?: string | null) {
  return action("addTask", async ({ supabase: sb, userId: uid }) => {
    const t = text(title, 140);
    if (!t) throw new Error("מה המשימה?");
    if (goalId) {
      const { data: g } = await sb.from("goals").select("id").match({ id: goalId, user_id: uid }).maybeSingle();
      if (!g) throw new Error("לא נמצא");
    }
    must(await sb.from("tasks").insert({ user_id: uid, goal_id: goalId, title: t, due: date(due), sort: Math.floor(Date.now() / 1000) }));
    refresh();
  });
}

export async function setTaskDone(id: string, done: boolean) {
  return action("setTaskDone", async ({ supabase: sb, userId: uid }) => {
    must(await sb.from("tasks").update({ done_at: done ? new Date().toISOString() : null }).match({ id, user_id: uid }));
    refresh();
  });
}

export async function deleteTask(id: string) {
  return action("deleteTask", async ({ supabase: sb, userId: uid }) => {
    must(await sb.from("tasks").delete().match({ id, user_id: uid }));
    refresh();
  });
}

export async function addMilestone(goalId: string, title: string, due?: string | null) {
  return action("addMilestone", async ({ supabase: sb, userId: uid }) => {
    const t = text(title, 140);
    if (!t) throw new Error("איך קוראים לאבן הדרך?");
    const { data: g } = await sb.from("goals").select("id").match({ id: goalId, user_id: uid }).maybeSingle();
    if (!g) throw new Error("לא נמצא");
    must(await sb.from("goal_milestones").insert({ user_id: uid, goal_id: goalId, title: t, due: date(due), sort: Math.floor(Date.now() / 1000) }));
    refresh();
  });
}

export async function setMilestoneDone(id: string, done: boolean) {
  return action("setMilestoneDone", async ({ supabase: sb, userId: uid }) => {
    must(await sb.from("goal_milestones").update({ done_at: done ? new Date().toISOString() : null }).match({ id, user_id: uid }));
    refresh();
  });
}

export async function deleteMilestone(id: string) {
  return action("deleteMilestone", async ({ supabase: sb, userId: uid }) => {
    must(await sb.from("goal_milestones").delete().match({ id, user_id: uid }));
    refresh();
  });
}

/* ---------- Time on a goal ---------- */

/** Weekly time → a flexible routine: sessions of about an hour, never more than one a day (same rule as hobbies). */
function sessionsFor(weekly: number) {
  const per = Math.max(1, Math.min(7, Math.round(weekly / 60)));
  const minutes = Math.max(15, Math.round(weekly / per / 5) * 5);
  return { per, minutes };
}

/** Time spent on a goal (from the focus timer or logged by hand). Counts as doing the goal's routine that day. */
export async function logGoalTime(id: string, minutes: number, day?: string) {
  return action("logGoalTime", async ({ supabase: sb, userId: uid }) => {
    const m = Math.round(minutes);
    if (!(m >= 1 && m <= 720)) throw new Error("כמה דקות?");
    const { data: g } = await sb.from("goals").select("routine_id").match({ id, user_id: uid }).maybeSingle();
    if (!g) throw new Error("לא נמצא");
    const today = todayInIsrael();
    const d = date(day) && day! <= today ? day! : today;
    must(await sb.from("goal_logs").insert({ user_id: uid, goal_id: id, date: d, minutes: m }));
    if (g.routine_id) await sb.from("routine_logs").upsert({ routine_id: g.routine_id, user_id: uid, date: d }, { onConflict: "routine_id,user_id,date", ignoreDuplicates: true });
    refresh();
  });
}

/** How much time a week the goal should get; above zero it sits in the calendar as a flexible routine. */
export async function setGoalWeekly(id: string, weekly: number) {
  return action("setGoalWeekly", async ({ supabase: sb, userId: uid }) => {
    const w = Math.max(0, Math.min(1200, Math.round(weekly || 0)));
    const { data: g } = await sb.from("goals").select("title, status, routine_id").match({ id, user_id: uid }).maybeSingle();
    if (!g) throw new Error("לא נמצא");
    must(await sb.from("goals").update({ weekly_minutes: w }).match({ id, user_id: uid }));
    const { per, minutes } = sessionsFor(w);
    if (g.routine_id) {
      must(await sb.from("routines").update(w > 0 ? { per_week: per, minutes, title: g.title, active: g.status === "active" } : { active: false }).match({ id: g.routine_id, user_id: uid }));
    } else if (w > 0) {
      const routineId = crypto.randomUUID();
      must(
        await sb.from("routines").insert({ id: routineId, user_id: uid, title: g.title, emoji: "🎯", category: "habit", mode: "flexible", days: [], start_time: null, minutes, per_week: per, time_window: "any", blocks_study: true, active: g.status === "active", starts_on: todayInIsrael() }),
      );
      must(await sb.from("goals").update({ routine_id: routineId }).match({ id, user_id: uid }));
    }
    refresh();
  });
}
