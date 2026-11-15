"use server";

import { refresh } from "next/cache";
import { action, must } from "@/app/guard";
import { AREAS, COLORS, MODES, STATUSES, blockedBy, cleanTemplate, templateFrom, type Goal, type GoalArea, type GoalStatus, type Milestone, type ProgressMode, type Task } from "@/lib/goalMeta";
import { addDays } from "@/lib/semester";
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
  description?: string;
  status?: GoalStatus;
  /** first tasks (tasks mode) or milestones (milestones mode), one per line */
  steps?: string[];
  /** one of the user's own templates: its milestones, steps and tasks are created with the goal (replaces `steps`) */
  templateId?: string;
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
        description: text(input.description, 2000) || null,
        started_on: today,
        due: date(input.due),
        progress_mode: mode,
        start_value: mode === "number" ? start : null,
        target_value: mode === "number" ? target : null,
        unit: mode === "number" ? text(input.unit, 12) || null : null,
        sort: Math.floor(Date.now() / 1000),
      }),
    );
    const tpl = input.templateId ? cleanTemplate((await sb.from("goal_templates").select("data").match({ id: input.templateId, user_id: uid }).maybeSingle()).data?.data) : null;
    if (input.templateId && !tpl) throw new Error("התבנית לא נמצאה");
    if (tpl) {
      // the template's structure, with its dates moved to the same distance from this goal's first day
      const when = (n: number | null) => (n == null ? null : addDays(today, n));
      const ms = tpl.milestones.map((m, i) => ({ id: crypto.randomUUID(), user_id: uid, goal_id: id, title: m.title, note: m.note, due: when(m.dueDays), sort: i }));
      if (ms.length) must(await sb.from("goal_milestones").insert(ms));
      const rows = [
        ...tpl.milestones.flatMap((m, i) => m.steps.map((s, j) => ({ user_id: uid, goal_id: id, milestone_id: ms[i].id as string | null, parent_id: null as string | null, title: s.title, note: s.note, due: null as string | null, sort: i * 100 + j }))),
      ];
      const parents = tpl.tasks.map((t, i) => ({ id: crypto.randomUUID(), user_id: uid, goal_id: id, title: t.title, note: t.note, due: when(t.dueDays), sort: 10_000 + i }));
      if (parents.length) must(await sb.from("tasks").insert(parents));
      rows.push(...tpl.tasks.flatMap((t, i) => t.subs.map((s, j) => ({ user_id: uid, goal_id: id, milestone_id: null as string | null, parent_id: parents[i].id as string | null, title: s.title, note: s.note, due: null as string | null, sort: j }))));
      if (rows.length) must(await sb.from("tasks").insert(rows));
      refresh();
      return id;
    }
    const steps = (input.steps ?? []).map((s) => text(s, 140)).filter(Boolean).slice(0, 30);
    if (steps.length && mode === "milestones") must(await sb.from("goal_milestones").insert(steps.map((t, i) => ({ user_id: uid, goal_id: id, title: t, sort: i }))));
    else if (steps.length) must(await sb.from("tasks").insert(steps.map((t, i) => ({ user_id: uid, goal_id: id, title: t, sort: i }))));
    refresh();
    return id;
  });
}

export async function updateGoal(id: string, patch: { title?: string; area?: GoalArea; color?: string; why?: string; description?: string; due?: string | null; status?: GoalStatus; target?: number | null; unit?: string }) {
  return action("updateGoal", async ({ supabase: sb, userId: uid }) => {
    const { data: g } = await sb.from("goals").select("title, status, start_value, progress_mode, routine_id, weekly_minutes").match({ id, user_id: uid }).maybeSingle();
    if (!g) throw new Error("לא נמצא");
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row.title = text(patch.title, 80) || g.title;
    if (patch.area !== undefined && patch.area in AREAS) row.area = patch.area;
    if (patch.color !== undefined && COLORS.includes(patch.color as (typeof COLORS)[number])) row.color = patch.color;
    if (patch.why !== undefined) row.why = text(patch.why, 300) || null;
    if (patch.description !== undefined) row.description = text(patch.description, 2000) || null;
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
/** A milestone that was split into steps is done exactly when all its steps are. Called after any change to its steps. */
async function syncMilestone(sb: Parameters<Parameters<typeof action>[1]>[0]["supabase"], uid: string, milestoneId: string | null | undefined) {
  if (!milestoneId) return;
  const [{ data: steps }, { data: m }] = await Promise.all([
    sb.from("tasks").select("done_at").match({ milestone_id: milestoneId, user_id: uid }),
    sb.from("goal_milestones").select("done_at").match({ id: milestoneId, user_id: uid }).maybeSingle(),
  ]);
  if (!m || !steps?.length) return; // no steps left: it is a plain milestone again, keep its own tick
  const all = steps.every((s) => s.done_at);
  if (all) {
    // finished at the moment its last step was (also after a step's completion time is corrected)
    const last = steps.map((s) => new Date(s.done_at as string).toISOString()).sort().at(-1)!;
    if (!m.done_at || new Date(m.done_at as string).toISOString() !== last) must(await sb.from("goal_milestones").update({ done_at: last }).match({ id: milestoneId, user_id: uid }));
  } else if (m.done_at) must(await sb.from("goal_milestones").update({ done_at: null }).match({ id: milestoneId, user_id: uid }));
}

/** A task that was split into sub-tasks is done exactly when all of them are, at the time of the last one. Called after any change to its sub-tasks. */
async function syncParent(sb: Parameters<Parameters<typeof action>[1]>[0]["supabase"], uid: string, parentId: string | null | undefined) {
  if (!parentId) return;
  const [{ data: subs }, { data: p }] = await Promise.all([
    sb.from("tasks").select("done_at").match({ parent_id: parentId, user_id: uid }),
    sb.from("tasks").select("done_at, milestone_id").match({ id: parentId, user_id: uid }).maybeSingle(),
  ]);
  if (!p || !subs?.length) return; // no sub-tasks left: a plain task again, keep its own tick
  const all = subs.every((s) => s.done_at);
  if (all) {
    const last = subs.map((s) => new Date(s.done_at as string).toISOString()).sort().at(-1)!;
    if (!p.done_at || new Date(p.done_at as string).toISOString() !== last) must(await sb.from("tasks").update({ done_at: last }).match({ id: parentId, user_id: uid }));
  } else if (p.done_at) must(await sb.from("tasks").update({ done_at: null }).match({ id: parentId, user_id: uid }));
}

/**
 * goalId null = a plain task with no goal. With milestoneId the task is a step of that milestone.
 * With parentId it is a sub-task of that task (one level: a sub-task can't be split again) and belongs to the same goal.
 */
export async function addTask(goalId: string | null, title: string, due?: string | null, milestoneId?: string | null, parentId?: string | null) {
  return action("addTask", async ({ supabase: sb, userId: uid }) => {
    const t = text(title, 140);
    if (!t) throw new Error("מה המשימה?");
    if (parentId) {
      const { data: p } = await sb.from("tasks").select("goal_id, parent_id, milestone_id").match({ id: parentId, user_id: uid }).maybeSingle();
      if (!p) throw new Error("המשימה לא נמצאה");
      if (p.parent_id || p.milestone_id) throw new Error("אפשר לפצל רק משימה רגילה");
      must(await sb.from("tasks").insert({ user_id: uid, goal_id: p.goal_id, parent_id: parentId, title: t, due: date(due), sort: Math.floor(Date.now() / 1000) }));
      await syncParent(sb, uid, parentId); // a new open sub-task reopens a finished task
      refresh();
      return;
    }
    if (goalId) {
      const { data: g } = await sb.from("goals").select("id").match({ id: goalId, user_id: uid }).maybeSingle();
      if (!g) throw new Error("לא נמצא");
    }
    if (milestoneId) {
      const { data: m } = await sb.from("goal_milestones").select("id").match({ id: milestoneId, user_id: uid, goal_id: goalId ?? "" }).maybeSingle();
      if (!m) throw new Error("אבן הדרך לא נמצאה");
    }
    must(await sb.from("tasks").insert({ user_id: uid, goal_id: goalId, milestone_id: milestoneId ?? null, title: t, due: date(due), sort: Math.floor(Date.now() / 1000) }));
    await syncMilestone(sb, uid, milestoneId); // a new open step reopens a finished milestone
    refresh();
  });
}

/**
 * In a goal measured by milestones the milestones are a sequence: one can't be finished (nor its
 * steps ticked) while an earlier one is open. Goals of the other kinds have no such rule.
 */
async function assertInOrder(sb: Parameters<Parameters<typeof action>[1]>[0]["supabase"], uid: string, milestoneId: string) {
  const { data: m } = await sb.from("goal_milestones").select("goal_id").match({ id: milestoneId, user_id: uid }).maybeSingle();
  if (!m) throw new Error("לא נמצא");
  const [{ data: g }, { data: all }] = await Promise.all([
    sb.from("goals").select("progress_mode").match({ id: m.goal_id, user_id: uid }).maybeSingle(),
    sb.from("goal_milestones").select("id, goal_id, title, due, done_at, sort").match({ goal_id: m.goal_id, user_id: uid }).order("sort").order("created_at"),
  ]);
  if (g?.progress_mode !== "milestones") return;
  const list = (all ?? []) as Milestone[];
  const before = blockedBy(list.find((x) => x.id === milestoneId)!, list);
  if (before) throw new Error(`קודם מסיימים את ״${before.title}״`);
}

export async function setTaskDone(id: string, done: boolean) {
  return action("setTaskDone", async ({ supabase: sb, userId: uid }) => {
    const { data: subs } = await sb.from("tasks").select("id").match({ parent_id: id, user_id: uid }).limit(1);
    if (subs?.length) throw new Error("משימה עם תתי־משימות מסתיימת כשכולן מסומנות");
    if (done) {
      const { data: cur } = await sb.from("tasks").select("milestone_id").match({ id, user_id: uid }).maybeSingle();
      if (cur?.milestone_id) await assertInOrder(sb, uid, cur.milestone_id as string);
    }
    const { data: t } = await sb.from("tasks").update({ done_at: done ? new Date().toISOString() : null }).match({ id, user_id: uid }).select("milestone_id, parent_id").maybeSingle();
    await syncMilestone(sb, uid, t?.milestone_id as string | null | undefined);
    await syncParent(sb, uid, t?.parent_id as string | null | undefined);
    refresh();
  });
}

export async function deleteTask(id: string) {
  return action("deleteTask", async ({ supabase: sb, userId: uid }) => {
    const { data: t } = await sb.from("tasks").delete().match({ id, user_id: uid }).select("milestone_id, parent_id").maybeSingle();
    await syncMilestone(sb, uid, t?.milestone_id as string | null | undefined);
    await syncParent(sb, uid, t?.parent_id as string | null | undefined);
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
    const { data: steps } = await sb.from("tasks").select("id").match({ milestone_id: id, user_id: uid }).limit(1);
    if (steps?.length) throw new Error("אבן דרך עם שלבים מסתיימת כשכל השלבים מסומנים");
    if (done) await assertInOrder(sb, uid, id);
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

/* ---------- Words: the progress journal and notes on steps ---------- */

/** A short progress update the user writes for themselves; shown on the goal's page, newest first. */
export async function addGoalNote(goalId: string, body: string) {
  return action("addGoalNote", async ({ supabase: sb, userId: uid }) => {
    const b = text(body, 1000);
    if (!b) throw new Error("מה התקדם?");
    const { data: g } = await sb.from("goals").select("id").match({ id: goalId, user_id: uid }).maybeSingle();
    if (!g) throw new Error("לא נמצא");
    must(await sb.from("goal_notes").insert({ user_id: uid, goal_id: goalId, date: todayInIsrael(), body: b }));
    refresh();
  });
}

export async function deleteGoalNote(id: string) {
  return action("deleteGoalNote", async ({ supabase: sb, userId: uid }) => {
    must(await sb.from("goal_notes").delete().match({ id, user_id: uid }));
    refresh();
  });
}

/** A description under a task or a milestone (empty = remove it) and, when `due` is passed, its target date (null = none). */
export async function setStepNote(kind: "task" | "milestone", id: string, note: string, due?: string | null) {
  return action("setStepNote", async ({ supabase: sb, userId: uid }) => {
    const row: Record<string, unknown> = { note: text(note, 500) || null };
    if (due !== undefined) row.due = date(due);
    must(await sb.from(kind === "task" ? "tasks" : "goal_milestones").update(row).match({ id, user_id: uid }));
    refresh();
  });
}

/* ---------- The user's own templates ---------- */

/** Saves a goal's shape (measure, milestones with steps, tasks, date spacing; no progress) as a template to start from again. */
export async function saveGoalTemplate(goalId: string, name: string) {
  return action("saveGoalTemplate", async ({ supabase: sb, userId: uid }) => {
    const [g, m, t, count] = await Promise.all([
      sb.from("goals").select("id, title, color, area, status, why, description, started_on, due, progress_mode, start_value, target_value, unit, weekly_minutes, routine_id, sort, created_at, done_at").match({ id: goalId, user_id: uid }).maybeSingle(),
      sb.from("goal_milestones").select("id, goal_id, title, due, done_at, sort, note").match({ goal_id: goalId, user_id: uid }),
      sb.from("tasks").select("id, goal_id, title, due, minutes, done_at, sort, created_at, note, milestone_id, parent_id").match({ goal_id: goalId, user_id: uid }),
      sb.from("goal_templates").select("id", { count: "exact", head: true }).eq("user_id", uid),
    ]);
    if (!g.data) throw new Error("לא נמצא");
    if ((count.count ?? 0) >= 50) throw new Error("יש כבר 50 תבניות. אפשר למחוק אחת בטופס של מטרה חדשה.");
    const goal = { ...g.data, start_value: g.data.start_value == null ? null : Number(g.data.start_value), target_value: g.data.target_value == null ? null : Number(g.data.target_value) } as Goal;
    const data = templateFrom(goal, { goals: [goal], milestones: (m.data ?? []) as Milestone[], tasks: (t.data ?? []) as Task[], logs: [] });
    const label = text(name, 60) || goal.title;
    must(await sb.from("goal_templates").insert({ user_id: uid, name: label, data: { ...data, title: label } }));
    refresh();
  });
}

export async function deleteGoalTemplate(id: string) {
  return action("deleteGoalTemplate", async ({ supabase: sb, userId: uid }) => {
    must(await sb.from("goal_templates").delete().match({ id, user_id: uid }));
    refresh();
  });
}

/**
 * Corrects when a task, a step or a plain milestone was completed (for something ticked later than
 * it was done). The chart places each completion at its own minute, so this is what moves a point.
 */
export async function setDoneAt(kind: "task" | "milestone", id: string, iso: string) {
  return action("setDoneAt", async ({ supabase: sb, userId: uid }) => {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) throw new Error("צריך תאריך ושעה");
    if (t > Date.now() + 2 * 60_000) throw new Error("אי אפשר לסמן השלמה בעתיד");
    if (t < Date.now() - 10 * 365 * 86_400_000) throw new Error("התאריך רחוק מדי");
    const when = new Date(Math.floor(t / 60_000) * 60_000).toISOString();
    if (kind === "task") {
      const { data: subs } = await sb.from("tasks").select("id").match({ parent_id: id, user_id: uid }).limit(1);
      if (subs?.length) throw new Error("משימה עם תתי־משימות מסתיימת כשהאחרונה שבהן מסתיימת");
      const { data: row } = await sb.from("tasks").update({ done_at: when }).match({ id, user_id: uid }).not("done_at", "is", null).select("milestone_id, parent_id").maybeSingle();
      if (!row) throw new Error("המשימה לא מסומנת כבוצעה");
      await syncMilestone(sb, uid, row.milestone_id as string | null);
      await syncParent(sb, uid, row.parent_id as string | null);
    } else {
      const { data: steps } = await sb.from("tasks").select("id").match({ milestone_id: id, user_id: uid }).limit(1);
      if (steps?.length) throw new Error("אבן דרך עם שלבים מסתיימת כשהשלב האחרון שלה מסתיים");
      const { data: row } = await sb.from("goal_milestones").update({ done_at: when }).match({ id, user_id: uid }).not("done_at", "is", null).select("id").maybeSingle();
      if (!row) throw new Error("אבן הדרך לא מסומנת כהושלמה");
    }
    refresh();
  });
}

/** Moves a milestone one place earlier (-1) or later (1) in its goal's order. */
export async function moveMilestone(id: string, dir: -1 | 1) {
  return action("moveMilestone", async ({ supabase: sb, userId: uid }) => {
    const { data: m } = await sb.from("goal_milestones").select("goal_id").match({ id, user_id: uid }).maybeSingle();
    if (!m) throw new Error("לא נמצא");
    const { data: all } = await sb.from("goal_milestones").select("id").match({ goal_id: m.goal_id, user_id: uid }).order("sort").order("created_at");
    const ids = (all ?? []).map((x) => x.id as string);
    const i = ids.indexOf(id);
    const j = i + (dir === -1 ? -1 : 1);
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    // renumber the whole (short) list, so equal or far-apart sort values can't leave the move without effect
    for (const [n, mid] of ids.entries()) must(await sb.from("goal_milestones").update({ sort: n }).match({ id: mid, user_id: uid }));
    refresh();
  });
}
