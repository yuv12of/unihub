import { test } from "node:test";
import assert from "node:assert/strict";
import { answeredCount, expectedShare, paceStatus, paceWarnings, paceWindow } from "@/lib/pace";

const infi = [
  { n: "01", due: "2026-11-12" },
  { n: "02", due: "2026-11-19" },
  { n: "03", due: "2026-11-26" },
];

test("the window: two weeks before, cut at the previous deadline, ending the day before", () => {
  assert.deepEqual(paceWindow(infi, "01", "2026-10-25"), { start: "2026-10-29", target: "2026-11-11" });
  assert.deepEqual(paceWindow(infi, "03", "2026-10-25"), { start: "2026-11-19", target: "2026-11-25" });
  // the semester's start cuts it too
  assert.deepEqual(paceWindow([{ n: "01", due: "2026-10-30" }], "01", "2026-10-25"), { start: "2026-10-25", target: "2026-10-29" });
  assert.equal(paceWindow(infi, "09", "2026-10-25"), null);
});

test("expected share grows steadily across the window", () => {
  const w = { start: "2026-11-01", target: "2026-11-10" }; // 10 days
  assert.equal(expectedShare(w, { date: "2026-10-30", minutes: 0 }), 0);
  assert.equal(expectedShare(w, { date: "2026-11-06", minutes: 0 }), 0.5);
  assert.equal(expectedShare(w, { date: "2026-11-12", minutes: 600 }), 1);
});

test("status: behind only past a part and 15%", () => {
  assert.equal(paceStatus(10, 10, 0.3).status, "done");
  assert.equal(paceStatus(5, 10, 0.5).status, "on");
  assert.equal(paceStatus(4, 10, 0.5).status, "on");
  assert.equal(paceStatus(2, 10, 0.5).status, "behind");
  assert.equal(paceStatus(2, 10, 0.5).gap, 3);
  assert.equal(paceStatus(7, 10, 0.5).status, "ahead");
});

test("answered: my marks win over the detection", () => {
  const keys = ["1א", "1ב", "2", "3ב(1)"];
  assert.equal(answeredCount(keys, ["1א", "2"], ["part:1ב", "partno:2", "parts"]), 2);
});

test("a warning once a day from 17:00, only when tracked, open, close and behind", () => {
  const base = { code: "20474", courseName: "אינפי", n: "01", label: "ממ״ן 01", due: "2026-11-12", window: { start: "2026-10-29", target: "2026-11-11" } };
  const behind = { ...base, last: { at: "2026-11-09T10:00:00Z", answered: 2, total: 10 } };
  const w = paceWarnings([behind], { date: "2026-11-09", minutes: 18 * 60 });
  assert.equal(w.length, 1);
  assert.equal(w[0].key, "pace|20474|01|2026-11-09");
  assert.match(w[0].body, /2 מתוך 10/);
  assert.equal(paceWarnings([behind], { date: "2026-11-09", minutes: 9 * 60 }).length, 0); // before 17:00
  assert.equal(paceWarnings([behind], { date: "2026-11-01", minutes: 18 * 60 }).length, 0); // 11 days left
  assert.equal(paceWarnings([{ ...base, last: null }], { date: "2026-11-09", minutes: 18 * 60 }).length, 0); // never tracked
  assert.equal(paceWarnings([{ ...behind, last: { ...behind.last, answered: 9 } }], { date: "2026-11-09", minutes: 18 * 60 }).length, 0);
});
