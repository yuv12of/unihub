import { test } from "node:test";
import assert from "node:assert/strict";
import { pace, wrapUp, type FocusEntry } from "@/lib/focusStats";

const e = (minutes: number, done: number, total = done, course: string | null = "20109"): FocusEntry => ({ date: "2026-11-01", course, minutes, planned: 45, done, total });

test("pace needs three sessions with tasks; this course first", () => {
  assert.equal(pace([e(60, 3), e(60, 3)], "20109"), null);
  assert.equal(pace([e(60, 3), e(60, 3), e(60, 3)], "20109"), 3);
  // only 2 of this course → falls back to all courses
  assert.ok(Math.abs(pace([e(60, 3), e(60, 3), e(30, 3, 3, "20474")], "20109")! - 3.6) < 1e-9);
  // sessions without tasks don't count
  assert.equal(pace([e(60, 0, 0), e(60, 2), e(60, 2), e(60, 2)], "20109"), 2);
});

test("summary lines", () => {
  const early = wrapUp({ studied: 30, planned: 45, done: 3, total: 3, open: 0, rate: 4 });
  assert.equal(early.headline, "3 מתוך 3 משימות ב־30 דק׳");
  assert.match(early.lines[0], /לפני הזמן.*30 דק׳/);
  const left = wrapUp({ studied: 45, planned: 45, done: 2, total: 4, open: 2, rate: 3 });
  assert.match(left.lines[0], /2 משימות עוברות/);
  assert.match(left.lines[1], /40 דק׳/); // 2 tasks at 3/hour = 40 min
  const none = wrapUp({ studied: 25, planned: 25, done: 0, total: 0, open: 0, rate: null });
  assert.equal(none.headline, "25 דק׳ של ריכוז");
  assert.match(none.lines[0], /2–3 משימות/);
});
