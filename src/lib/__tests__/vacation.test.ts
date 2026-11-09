import { test } from "node:test";
import assert from "node:assert/strict";
import { daysOf, vacationImpact, vacationsOf } from "@/lib/vacation";

test("a vacation's days, both ends included", () => {
  assert.deepEqual(daysOf("2026-12-13", "2026-12-16"), ["2026-12-13", "2026-12-14", "2026-12-15", "2026-12-16"]);
  assert.deepEqual(daysOf("2026-12-31", "2027-01-01"), ["2026-12-31", "2027-01-01"]);
  assert.deepEqual(daysOf("2026-12-16", "2026-12-13"), []);
});

test("consecutive days become one vacation", () => {
  assert.deepEqual(vacationsOf(["2026-12-15", "2026-12-13", "2026-12-14", "2026-12-20"]), [
    { from: "2026-12-13", to: "2026-12-15" },
    { from: "2026-12-20", to: "2026-12-20" },
  ]);
});


test("what a vacation touches: deadlines in and right after it, exams, meetings, the study that moves", () => {
  const items = [
    { date: "2026-12-14", kind: "due", label: "ממ״ן 04" },
    { date: "2026-12-17", kind: "due", label: "ממ״ח 05" },
    { date: "2026-12-20", kind: "due", label: "ממ״ן 06" }, // 4 days after: not "right after"
    { date: "2026-12-15", kind: "due", label: "ממ״ן 99", done: true },
    { date: "2026-12-18", kind: "exam", label: "בחינה" },
    { date: "2026-12-13", kind: "tutorial", label: "מפגש 5" },
    { date: "2026-12-14", kind: "tutorial", label: "הנחיה טלפונית", optional: true },
    { date: "2026-12-13", kind: "study", label: "הכנה", minutes: 90 },
    { date: "2026-12-16", kind: "study", label: "הכנה", minutes: 60 },
    { date: "2026-12-16", kind: "study", label: "הכנה", minutes: 45, status: "done" as const },
    { date: "2026-12-12", kind: "study", label: "הכנה", minutes: 30 },
  ];
  const i = vacationImpact(items, "2026-12-13", "2026-12-16");
  assert.deepEqual(i.dueInside.map((x) => x.label), ["ממ״ן 04"]);
  assert.deepEqual(i.dueAfter.map((x) => x.label), ["ממ״ח 05"]);
  assert.deepEqual(i.exams.map((x) => x.label), ["בחינה"]);
  assert.deepEqual(i.meetings.map((x) => x.label), ["מפגש 5"]);
  assert.equal(i.studyMinutes, 150);
  assert.equal(i.sessions, 2);
});
