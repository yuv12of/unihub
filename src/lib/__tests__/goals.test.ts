import { test } from "node:test";
import assert from "node:assert/strict";
import { lastMove, movedSince, nextStep, numberProgress, plannedNow, progressAt, progressText, projectedFinish, series, spark, stalledDays, type Goal, type GoalData, type GoalLog, type Milestone, type Task } from "@/lib/goalMeta";

const goal = (p: Partial<Goal> = {}): Goal => ({
  id: "g", title: "x", color: "blue", area: "personal", status: "active", why: null, started_on: "2026-10-01", due: null, progress_mode: "tasks",
  start_value: null, target_value: null, unit: null, weekly_minutes: 0, routine_id: null, sort: 0, created_at: "2026-10-01T08:00:00Z", done_at: null, ...p,
});
const task = (id: string, done: string | null, sort = 0): Task => ({ id, goal_id: "g", title: id, due: null, minutes: null, done_at: done && done + "T10:00:00Z", sort, created_at: "2026-10-01T08:00:00Z" });
const ms = (id: string, done: string | null, sort = 0): Milestone => ({ id, goal_id: "g", title: id, due: null, done_at: done && done + "T10:00:00Z", sort });
const log = (date: string, p: Partial<GoalLog>): GoalLog => ({ id: date, goal_id: "g", date, value: null, percent: null, minutes: null, note: null, ...p });
const data = (g: Goal, p: Partial<GoalData> = {}): GoalData => ({ goals: [g], milestones: [], tasks: [], logs: [], ...p });

test("tasks mode: done over total, as of a date", () => {
  const g = goal();
  const d = data(g, { tasks: [task("a", "2026-10-05"), task("b", "2026-10-20"), task("c", null), task("d", null)] });
  assert.equal(progressAt(g, d, "2026-10-04"), 0);
  assert.equal(progressAt(g, d, "2026-10-05"), 0.25);
  assert.equal(progressAt(g, d, "2026-11-13"), 0.5);
  assert.equal(progressText(g, d, "2026-11-13"), "2 מתוך 4 משימות");
  assert.equal(progressAt(g, data(g), "2026-11-13"), 0); // no tasks yet
});

test("milestones mode", () => {
  const g = goal({ progress_mode: "milestones" });
  const d = data(g, { milestones: [ms("a", "2026-10-10"), ms("b", null), ms("c", null)] });
  assert.ok(Math.abs(progressAt(g, d, "2026-11-01") - 1 / 3) < 1e-9);
});

test("number mode: up, down, and out of range", () => {
  assert.equal(numberProgress({ start_value: 0, target_value: 12000 }, 3000), 0.25);
  assert.equal(numberProgress({ start_value: 90, target_value: 80 }, 85), 0.5); // losing weight
  assert.equal(numberProgress({ start_value: 0, target_value: 10 }, 15), 1);
  assert.equal(numberProgress({ start_value: 0, target_value: 10 }, -3), 0);
  assert.equal(numberProgress({ start_value: 5, target_value: 5 }, 5), 0); // no range, no division by zero
  const g = goal({ progress_mode: "number", start_value: 0, target_value: 10, unit: "ק״מ" });
  const d = data(g, { logs: [log("2026-10-20", { value: 4 }), log("2026-10-10", { value: 2 })] });
  assert.equal(progressAt(g, d, "2026-10-15"), 0.2);
  assert.equal(progressAt(g, d, "2026-11-01"), 0.4);
  assert.equal(progressText(g, d, "2026-11-01"), "4 מתוך 10 ק״מ");
});

test("manual mode uses the latest percent; a finished goal is 100%", () => {
  const g = goal({ progress_mode: "manual" });
  const d = data(g, { logs: [log("2026-10-10", { percent: 30 }), log("2026-10-25", { percent: 55 })] });
  assert.equal(progressAt(g, d, "2026-10-12"), 0.3);
  assert.equal(progressAt(g, d, "2026-11-01"), 0.55);
  const done = goal({ status: "done", done_at: "2026-11-02T09:00:00Z" });
  assert.equal(progressAt(done, data(done, { tasks: [task("a", null)] }), "2026-11-03"), 1);
  assert.equal(progressAt(done, data(done, { tasks: [task("a", null)] }), "2026-11-01"), 0);
});

test("stalled after 10 quiet days, only while active", () => {
  const g = goal();
  const d = data(g, { tasks: [task("a", "2026-11-01"), task("b", null)] });
  assert.equal(lastMove(g, d), "2026-11-01");
  assert.equal(stalledDays(g, d, "2026-11-10"), 0);
  assert.equal(stalledDays(g, d, "2026-11-13"), 12);
  assert.equal(stalledDays(goal({ status: "paused" }), d, "2026-11-13"), 0);
  assert.equal(movedSince(g, d, "2026-11-01"), true);
  assert.equal(movedSince(g, d, "2026-11-02"), false);
  assert.equal(movedSince(g, data(g), "2026-10-01"), false); // creating isn't moving
});

test("next step: first open task by order, then milestones", () => {
  const g = goal();
  assert.equal(nextStep(g, data(g, { tasks: [task("b", null, 2), task("a", null, 1), task("z", "2026-10-02", 0)], milestones: [ms("m", null)] }))?.title, "a");
  assert.equal(nextStep(g, data(g, { tasks: [task("z", "2026-10-02")], milestones: [ms("m", null)] }))?.kind, "milestone");
  assert.equal(nextStep(g, data(g)), null);
});

test("projection follows the recent pace", () => {
  // 20 days in, half done → 20 more days
  const g = goal({ started_on: "2026-10-24" });
  const d = data(g, { tasks: [task("a", "2026-10-30"), task("b", "2026-11-10"), task("c", null), task("d", null)] });
  assert.equal(projectedFinish(g, d, "2026-11-13"), "2026-12-03");
  // nothing done → nothing to project
  assert.equal(projectedFinish(g, data(g, { tasks: [task("a", null)] }), "2026-11-13"), null);
  // an old goal that stopped moving a month ago → no projection
  const old = goal({ started_on: "2026-06-01" });
  assert.equal(projectedFinish(old, data(old, { tasks: [task("a", "2026-07-01"), task("b", null)] }), "2026-11-13"), null);
  // finished → none
  assert.equal(projectedFinish(g, data(g, { tasks: [task("a", "2026-11-01")] }), "2026-11-13"), null);
});

test("planned line and chart series", () => {
  assert.equal(plannedNow(goal({ started_on: "2026-11-01", due: "2026-11-21" }), "2026-11-11"), 0.5);
  assert.equal(plannedNow(goal({ started_on: "2026-11-01", due: "2026-11-05" }), "2026-11-11"), 1);
  assert.equal(plannedNow(goal(), "2026-11-11"), null);
  const g = goal();
  const d = data(g, { tasks: [task("a", "2026-10-05"), task("b", null)] });
  const s = series(g, d, "2026-11-13");
  assert.equal(s[0].date, "2026-10-01");
  assert.equal(s.at(-1)!.date, "2026-11-13");
  assert.equal(s.at(-1)!.p, 0.5);
  assert.ok(s.length <= 41);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].date > s[i - 1].date);
  assert.equal(series(goal({ started_on: "2026-11-13" }), d, "2026-11-13").length, 2); // created today
  assert.equal(spark(g, d, "2026-11-13").length, 8);
});

test("goal pushes: due tomorrow in the evening, stalled on day 10 and weekly after", async () => {
  const { goalPushes } = await import("@/lib/goalMeta");
  const g = goal();
  const due: Task = { ...task("a", null), due: "2026-11-14" };
  const d = data(g, { tasks: [due, task("b", "2026-11-03")] });
  assert.deepEqual(goalPushes(d, { date: "2026-11-13", minutes: 17 * 60 }).map((p) => p.key), ["gs|g|2026-11-13"]); // 10 quiet days, before 18:00
  assert.deepEqual(goalPushes(d, { date: "2026-11-13", minutes: 18 * 60 }).map((p) => p.key), ["gd|a|2026-11-14", "gs|g|2026-11-13"]);
  assert.equal(goalPushes(d, { date: "2026-11-14", minutes: 12 * 60 }).length, 0); // day 11: quiet
  assert.equal(goalPushes(d, { date: "2026-11-20", minutes: 12 * 60 }).length, 1); // day 17
  assert.equal(goalPushes(d, { date: "2026-11-13", minutes: 9 * 60 }).length, 0);
  const paused = goal({ status: "paused" });
  assert.equal(goalPushes(data(paused, { tasks: [due] }), { date: "2026-11-13", minutes: 20 * 60 }).length, 0);
});

test("today's steps: one per active goal, dated first, plus loose tasks due", async () => {
  const { todaySteps } = await import("@/lib/goalMeta");
  const a = goal({ id: "a", sort: 1 });
  const b = goal({ id: "b", sort: 2 });
  const c = goal({ id: "c", status: "paused" });
  const t = (id: string, goal_id: string | null, due: string | null): Task => ({ ...task(id, null), goal_id, due });
  const d: GoalData = { goals: [a, b, c], milestones: [], logs: [], tasks: [t("a1", "a", null), t("b1", "b", "2026-11-14"), t("c1", "c", null), t("l1", null, "2026-11-12"), t("l2", null, "2026-11-20"), t("l3", null, null)] };
  assert.deepEqual(todaySteps(d, "2026-11-13").map((s) => s.id), ["b1", "a1", "l1"]);
});

test("time on goals and badge stats", async () => {
  const { goalBadgeStats, goalMinutesByDay, goalMinutesSince } = await import("@/lib/goalMeta");
  const g = goal();
  const done = goal({ id: "d", status: "done", done_at: "2026-11-01T10:00:00Z" });
  const d: GoalData = {
    goals: [g, done],
    milestones: [ms("m", "2026-10-03")],
    tasks: [task("a", "2026-10-05"), task("b", "2026-11-12"), task("c", null)],
    logs: [log("2026-11-12", { minutes: 40 }), log("2026-11-12", { minutes: 20 }), log("2026-11-02", { minutes: 30 }), log("2026-11-12", { value: 3 })],
  };
  assert.deepEqual(goalMinutesByDay(d), { "2026-11-12": 60, "2026-11-02": 30 });
  assert.equal(goalMinutesSince(g, d, "2026-11-08"), 60);
  const s = goalBadgeStats(d, "2026-11-08");
  assert.equal(s.done, 1);
  assert.equal(s.steps, 3);
  assert.equal(s.movedThisWeek, 1);
  assert.equal(s.minutes, 90);
  assert.equal(s.comebacks, 2); // 5.10 → 2.11 and 2.11 → 12.11 are both gaps of 10+ days
});

test("timeline: a line from creation to now, flat while quiet, rising into each step", async () => {
  const { timeline, valueAt } = await import("@/lib/goalMeta");
  const H = 3_600_000;
  const at = (iso: string) => Date.parse(iso);
  const g = goal({ created_at: "2026-11-01T08:00:00Z" });
  const t = (id: string, done: string | null): Task => ({ ...task(id, null), done_at: done });
  const d = data(g, { tasks: [t("a", "2026-11-01T10:00:00Z"), t("b", "2026-11-05T10:00:00Z"), t("c", null), t("d", null)] });
  const now = at("2026-11-07T10:00:00Z");
  const pts = timeline(g, d, now);
  assert.equal(pts[0].t, at("2026-11-01T08:00:00Z"));
  assert.equal(pts[0].p, 0);
  assert.equal(pts.at(-1)!.t, now);
  assert.equal(pts.at(-1)!.p, 0.5);
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].t >= pts[i - 1].t && pts[i].p >= pts[i - 1].p);
  assert.deepEqual(pts.filter((q) => q.label).map((q) => q.label), ["a", "b"]);
  // flat between the two steps, rising only in the half day before the second
  assert.equal(valueAt(pts, at("2026-11-03T10:00:00Z")), 0.25);
  assert.equal(valueAt(pts, at("2026-11-04T22:00:00Z")), 0.25);
  assert.equal(valueAt(pts, at("2026-11-05T04:00:00Z")), 0.375);
  assert.equal(valueAt(pts, at("2026-11-05T10:00:00Z")), 0.5);
  assert.equal(valueAt(pts, pts[0].t - H), 0);
  assert.equal(valueAt(pts, now + H), 0.5);
});

test("timeline: a goal created minutes ago still has a line; number goals use their logs", async () => {
  const { timeline } = await import("@/lib/goalMeta");
  const now = Date.parse("2026-11-14T11:00:00Z");
  const fresh = goal({ created_at: "2026-11-14T10:00:00Z", started_on: "2026-11-14" });
  const t = (id: string, done: string | null): Task => ({ ...task(id, null), done_at: done });
  const pts = timeline(fresh, data(fresh, { tasks: [t("a", "2026-11-14T10:05:00Z"), t("b", "2026-11-14T10:20:00Z"), t("c", "2026-11-14T10:40:00Z"), t("d", null), t("e", null)] }), now);
  assert.ok(pts.length >= 4);
  assert.ok(Math.abs(pts.at(-1)!.p - 0.6) < 1e-9);
  assert.equal(timeline(fresh, data(fresh), now).length, 2); // nothing done: a flat line at zero
  const n = goal({ progress_mode: "number", start_value: 0, target_value: 10, unit: "ק״מ", created_at: "2026-11-01T08:00:00Z" });
  const np = timeline(n, data(n, { logs: [log("2026-11-10", { value: 4 }), log("2026-11-03", { value: 2 })] }), now);
  assert.deepEqual(np.filter((q) => q.label).map((q) => [q.label, q.p]), [["2 ק״מ", 0.2], ["4 ק״מ", 0.4]]);
  // something dated after "now" is not drawn
  const future = timeline(n, data(n, { logs: [log("2026-12-01", { value: 9 })] }), now);
  assert.equal(future.at(-1)!.p, 0);
});

test("a journal entry counts as movement", () => {
  const g = goal();
  const d = { ...data(g, { tasks: [task("a", "2026-10-05")] }), notes: [{ id: "n", goal_id: "g", date: "2026-11-10", body: "x", created_at: "2026-11-10T10:00:00Z" }] };
  assert.equal(lastMove(g, d), "2026-11-10");
  assert.equal(stalledDays(g, d, "2026-11-13"), 0);
});
