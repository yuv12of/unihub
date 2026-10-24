import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRhythm, computeRhythm, topBlockers, type DayCheck } from "@/lib/rhythm";

const today = "2026-11-20";
const day = (n: number) => {
  const t = new Date(today + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
};
const check = (n: number, focus_band: DayCheck["focus_band"], energy = 4, blockers: string[] = []): DayCheck => ({ date: day(n), energy, blockers, focus_band });

test("no best band until five checks name one, and only with a clear winner", () => {
  const four = [1, 2, 3, 4].map((n) => check(n, "morning"));
  assert.equal(computeRhythm({ checks: four, sessionRows: [], courses: ["a", "b"], today }).best, null);
  const five = [...four, check(5, "morning")];
  assert.equal(computeRhythm({ checks: five, sessionRows: [], courses: ["a", "b"], today }).best, "morning");
  const tie = [check(1, "morning"), check(2, "evening"), check(3, "morning"), check(4, "evening"), check(5, "morning"), check(6, "evening")];
  assert.equal(computeRhythm({ checks: tie, sessionRows: [], courses: ["a", "b"], today }).best, null);
});

test("old checks (over six weeks) don't count", () => {
  const old = [50, 51, 52, 53, 54].map((n) => check(n, "evening"));
  const r = computeRhythm({ checks: old, sessionRows: [], courses: ["a"], today });
  assert.equal(r.best, null);
  assert.equal(r.n, 0);
});

test("hardest course = most skipped (with at least 3 sessions), then stuck points", () => {
  const rows = [
    ...[1, 2, 3].map((n) => ({ session_key: `${day(n)}|routine|b|routine`, status: "skipped" })),
    { session_key: `${day(4)}|routine|b|routine`, status: "done" },
    ...[1, 2, 3, 4].map((n) => ({ session_key: `${day(n)}|routine|a|routine`, status: "done" })),
  ];
  assert.deepEqual(computeRhythm({ checks: [], sessionRows: rows, courses: ["a", "b", "c"], today }).hard, ["b", "a", "c"]);
  assert.deepEqual(computeRhythm({ checks: [], sessionRows: [], courses: ["a", "b", "c"], focus: { c: 2 }, today }).hard, ["c", "a", "b"]);
});

const s = (date: string, start: string, code: string, ref: string, minutes = 90) => ({ date, start, minutes, courseCode: code, kind: "routine", title: `t-${code}`, ref, why: `why-${code}` });

test("the hardest course moves into the best band; times stay, refs renumber", () => {
  const rhythm = { best: "afternoon" as const, hard: ["c", "a", "b"], n: 6, updated: today };
  const out = applyRhythm([s("2026-11-22", "08:45", "c", "routine"), s("2026-11-22", "14:30", "a", "routine")], rhythm, today, (c) => `t-${c}`);
  assert.deepEqual(out.map((x) => [x.start, x.courseCode, x.ref, x.why]), [
    ["08:45", "a", "routine", "why-a"],
    ["14:30", "c", "routine", "why-c"],
  ]);
});

test("today, different lengths, other kinds and 'off' are left alone", () => {
  const rhythm = { best: "afternoon" as const, hard: ["c", "a"], n: 6, updated: today };
  const todays = [s(today, "08:45", "c", "routine"), s(today, "14:30", "a", "routine")];
  assert.equal(applyRhythm(structuredClone(todays), rhythm, today, String)[1].courseCode, "a");
  const lens = [s("2026-11-22", "08:45", "c", "routine", 90), s("2026-11-22", "14:30", "a", "routine", 60)];
  assert.equal(applyRhythm(structuredClone(lens), rhythm, today, String)[1].courseCode, "a");
  const off = [s("2026-11-22", "08:45", "c", "routine"), s("2026-11-22", "14:30", "a", "routine")];
  assert.equal(applyRhythm(structuredClone(off), { ...rhythm, off: true }, today, String)[1].courseCode, "a");
  const exam = [{ ...s("2026-11-22", "08:45", "c", "exam0"), kind: "routine" }, s("2026-11-22", "14:30", "a", "routine")];
  assert.equal(applyRhythm(structuredClone(exam), rhythm, today, String)[1].courseCode, "a");
});

test("two sessions of one course on a day keep unique refs after a swap", () => {
  const rhythm = { best: "evening" as const, hard: ["b", "a"], n: 6, updated: today };
  const out = applyRhythm(
    [s("2026-11-22", "09:00", "a", "routine"), s("2026-11-22", "11:00", "a", "routine2"), s("2026-11-22", "18:00", "b", "routine")],
    rhythm,
    today,
    String,
  );
  const keys = out.map((x) => `${x.courseCode}|${x.ref}`);
  assert.equal(new Set(keys).size, 3);
  assert.equal(out.find((x) => x.start === "18:00")!.courseCode, "b");
});

test("top blockers: only repeated ones, most frequent first", () => {
  const list = [check(1, null, 3, ["phone", "tired"]), check(2, null, 3, ["phone"]), check(3, null, 3, ["noise"])];
  assert.deepEqual(topBlockers(list, today).map((b) => [b.id, b.n]), [["phone", 2]]);
});
