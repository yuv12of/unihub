import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanParams, describeTrigger, evaluateIfThen, focusMinutesOf, ifThenPush, type IfThenPlan, type TriggerContext } from "@/lib/ifthen";

const base: TriggerContext = {
  date: "2026-10-26", // Monday
  minutes: 9 * 60 + 5,
  weekday: 1,
  sessions: [{ key: "k1", start: "08:45", end: "10:15", title: "לימוד שוטף באלגברה" }],
  liveStartedAt: null,
  studiedToday: 0,
  routines: [{ routineId: "gym", title: "אימון", start: "07:00", end: "08:00", done: false }],
  week: { goal: 1200, done: 300, planned: 600 },
};
const plan = (kind: IfThenPlan["kind"], params: IfThenPlan["params"] = {}, action = "15 דקות כרטיסיות"): IfThenPlan => ({ id: kind, kind, params, action, active: true });

test("session_not_started fires N minutes after the start, once a day", () => {
  const p = plan("session_not_started", { after: 15 });
  assert.equal(evaluateIfThen([p], { ...base, minutes: 8 * 60 + 55 }).length, 0); // only 10 minutes in
  const [f] = evaluateIfThen([p], base);
  assert.equal(f.key, "if|session_not_started|2026-10-26");
  assert.match(f.because, /לימוד שוטף באלגברה/);
});

test("session_not_started stays quiet once the session is marked, a timer runs, or it ended", () => {
  const p = plan("session_not_started", { after: 15 });
  assert.equal(evaluateIfThen([p], { ...base, sessions: [{ ...base.sessions[0], status: "done" }] }).length, 0);
  assert.equal(evaluateIfThen([p], { ...base, liveStartedAt: 8 * 60 + 50 }).length, 0);
  assert.equal(evaluateIfThen([p], { ...base, minutes: 10 * 60 + 20 }).length, 0);
  // a timer left over from last night doesn't count as starting this session
  assert.equal(evaluateIfThen([p], { ...base, liveStartedAt: 0 }).length, 1);
});

test("missed_day: nothing logged by the time, on chosen days only", () => {
  const p = plan("missed_day", { by: "18:00", days: [0, 1, 2, 3, 4] });
  assert.equal(evaluateIfThen([p], { ...base, minutes: 17 * 60 }).length, 0);
  assert.equal(evaluateIfThen([p], { ...base, minutes: 18 * 60 + 5 }).length, 1);
  assert.equal(evaluateIfThen([p], { ...base, minutes: 18 * 60 + 5, studiedToday: 30 }).length, 0);
  assert.equal(evaluateIfThen([p], { ...base, minutes: 18 * 60 + 5, weekday: 5 }).length, 0);
  assert.equal(evaluateIfThen([p], { ...base, minutes: 23 * 60 }).length, 0); // too late to nag
});

test("routine_missed: after the routine's end time, if not ticked", () => {
  const p = plan("routine_missed", { routine_id: "gym" }, "20 דקות הליכה");
  assert.equal(evaluateIfThen([p], { ...base, minutes: 7 * 60 + 30 }).length, 0);
  const [f] = evaluateIfThen([p], { ...base, minutes: 8 * 60 + 10 });
  assert.equal(f.because, "אימון לא סומן היום");
  assert.equal(evaluateIfThen([p], { ...base, minutes: 8 * 60 + 10, routines: [{ ...base.routines[0], done: true }] }).length, 0);
});

test("behind_goal: gap after the plan larger than X, at the check time", () => {
  const p = plan("behind_goal", { gap: 180, at: "20:00", days: [1] });
  assert.equal(evaluateIfThen([p], { ...base, minutes: 20 * 60 + 5 }).length, 1); // 1200-300-600 = 300 > 180
  assert.equal(evaluateIfThen([p], { ...base, minutes: 20 * 60 + 5, week: { goal: 1200, done: 500, planned: 600 } }).length, 0);
  assert.equal(evaluateIfThen([p], { ...base, minutes: 20 * 60 + 5, week: { goal: null, done: 0, planned: 0 } }).length, 0);
  assert.equal(evaluateIfThen([p], { ...base, minutes: 19 * 60 }).length, 0);
});

test("inactive plans never fire", () => {
  assert.equal(evaluateIfThen([{ ...plan("session_not_started"), active: false }], base).length, 0);
});

test("push quotes the plan and opens a focus timer of the plan's length", () => {
  const [f] = evaluateIfThen([plan("session_not_started")], base);
  const n = ifThenPush(f);
  assert.equal(n.title, "התוכנית שלך: 15 דקות כרטיסיות");
  assert.equal(n.url, "/?focus=1&min=15");
  assert.equal(focusMinutesOf("לפתוח את הספר"), 2);
  assert.equal(focusMinutesOf("רבע שעה תרגול"), 15);
  assert.equal(focusMinutesOf("שעה וחצי לימוד"), 90);
  assert.equal(focusMinutesOf("לקרוא 2 דקות"), 2);
});

test("params are cleaned per kind", () => {
  assert.deepEqual(cleanParams("session_not_started", { after: "500", by: "x" }), { after: 120 });
  assert.deepEqual(cleanParams("missed_day", { by: "25:00", days: [1, 1, 9, 2] }), { by: "18:00", days: [1, 2] });
  assert.match(describeTrigger("missed_day", { by: "18:00" }), /לא למדתי כלום \(א׳–ה׳\)$/);
});
