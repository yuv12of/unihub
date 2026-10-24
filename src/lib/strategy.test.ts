/**
 * Tests for the semester strategist. Run:
 *   node -e "require('jiti').createJiti(__filename,{alias:{'@':process.cwd()+'/src'}}).import('./src/lib/strategy.test.ts')"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import data from "@/data/semester-2027a.json";
import { courseFromRow, type CourseRow } from "@/lib/semester";
import { prepMinutes, buildPlan, defaultPrefs, nextExams, type Exam } from "@/lib/planner";
import type { ProgressMap } from "@/lib/progress";
import { courseStrategy, crunches, freeMinutes, parseRules, protectiveRule } from "@/lib/strategy";

type Raw = { code: string; name: string; assignmentWeight: { min: number; max: number }; rules?: string[]; assignments: CourseRow["assignments"] };
const courses = (data as unknown as { courses: Raw[] }).courses.map((c, i) =>
  courseFromRow({ code: c.code, name: c.name, min_weight: c.assignmentWeight.min, max_weight: c.assignmentWeight.max, rules: c.rules, assignments: c.assignments, color: ["blue", "purple", "green"][i] }),
);
const course = (code: string) => courses.find((c) => c.code === code)!;
const TODAY = "2026-10-25";

test("parses the 20407 group rule in English and Hebrew", () => {
  assert.deepEqual(parseRules(["Must submit at least 3 of 01-05"])[0].among, ["01", "02", "03", "04", "05"]);
  const he = parseRules(["חובה להגיש לפחות 3 מהמטלות 01 עד 05."])[0];
  assert.equal(he.count, 3);
  assert.deepEqual(he.among, ["01", "02", "03", "04", "05"]);
  assert.equal(parseRules(["אפשר להגיש בזוגות."]).length, 0);
});

test("20407 at the start: three of 01–05 is the cheapest way, nothing mandatory yet", () => {
  const s = courseStrategy({ course: course("20407"), progress: {}, today: TODAY, prep: prepMinutes });
  assert.equal(s.feasible, true);
  assert.equal(s.satisfied, false);
  assert.equal(s.best!.length, 3);
  assert.ok(s.best!.every((n) => ["01", "02", "03", "04", "05"].includes(n)));
  assert.deepEqual(s.mandatory, []);
  assert.equal(s.safeToSkip.length, 6);
  assert.ok(s.lines.some((l) => l.text.includes("לפחות 3")));
});

test("20407: after skipping 01 and 02, all of 03–05 become mandatory", () => {
  const progress: ProgressMap = { "20407-01": { status: "skipped", grade: null }, "20407-02": { status: "skipped", grade: null } };
  const s = courseStrategy({ course: course("20407"), progress, today: TODAY, prep: prepMinutes });
  assert.equal(s.feasible, true);
  assert.deepEqual(s.mandatory, ["03", "04", "05"]);
  assert.deepEqual(s.safeToSkip, ["06"]);
  assert.ok(s.lines.some((l) => l.tone === "warn" && l.text.includes("ממ״ן 03")));
});

test("20407: missing three of 01–05 makes the rule impossible even with weight to spare", () => {
  const progress: ProgressMap = {
    "20407-01": { status: "skipped", grade: null },
    "20407-02": { status: "skipped", grade: null },
    "20407-03": { status: "skipped", grade: null },
  };
  const s = courseStrategy({ course: course("20407"), progress, today: TODAY, prep: prepMinutes });
  assert.equal(s.feasible, false);
  assert.equal(s.best, null);
  assert.match(s.lines[0].text, /אי אפשר כבר לעמוד בדרישה/);
});

test("past deadlines count as missed, not open", () => {
  const s = courseStrategy({ course: course("20474"), progress: { "20474-01": { status: "submitted", grade: 90 } }, today: "2026-11-20", prep: prepMinutes });
  assert.equal(s.items.find((i) => i.n === "02")!.state, "missed");
  assert.equal(s.earned, 2);
});

test("20109 satisfied: everything left is optional and the protective rule is explained", () => {
  const progress: ProgressMap = Object.fromEntries(["01", "02", "04", "06"].map((n) => [`20109-${n}`, { status: "submitted" as const, grade: 80 }]));
  const s = courseStrategy({ course: course("20109"), progress, today: "2027-01-22", prep: prepMinutes });
  assert.equal(s.earned, 14);
  assert.equal(s.satisfied, true);
  assert.deepEqual(s.best, []);
  assert.ok(s.lines.some((l) => l.text.includes("גבוה מציון הבחינה")));
});

test("protective rule is unknown for a course nobody checked", () => {
  assert.equal(protectiveRule({ code: "99999", rules: [] }).known, false);
});

test("the cheapest set prefers less prep time (online assignments over files)", () => {
  // 20109 needs 11. Submitted 01 (3) and 02 (3): needs 5 more, open: 03 (1, online), 04 (4), 05 (1), 06 (4), 07 (3), 08 (1).
  const progress: ProgressMap = { "20109-01": { status: "submitted", grade: 80 }, "20109-02": { status: "submitted", grade: 80 } };
  const s = courseStrategy({ course: course("20109"), progress, today: "2026-12-11", prep: prepMinutes });
  assert.equal(s.feasible, true);
  const w = s.best!.reduce((t, n) => t + course("20109").assignments.find((a) => a.n === n)!.weight, 0);
  assert.ok(w >= 5);
  assert.ok(s.best!.includes("03"), "a 1-point online assignment is cheap");
  assert.ok(s.combos > 10);
});

test("crunch weeks: 10.12 has three file deadlines; tight availability suggests a safe skip", () => {
  const tight = freeMinutes({ availability: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { start: "20:00", minutes: d === 6 ? 0 : 45 }])) });
  const cs = crunches({ courses, progress: {}, today: "2026-11-27", prep: prepMinutes, free: tight });
  const dec = cs.find((c) => c.first === "2026-12-10");
  assert.ok(dec, "a crunch starting 10.12");
  assert.equal(dec!.items.length, 3);
  assert.equal(dec!.tone, "warn");
  assert.ok(dec!.suggestion, "suggests something to skip");
  assert.match(dec!.text, /אפשר לוותר על/);

  const roomy = freeMinutes(defaultPrefs);
  const ok = crunches({ courses, progress: {}, today: "2026-11-27", prep: prepMinutes, free: roomy }).find((c) => c.first === "2026-12-10")!;
  assert.ok(ok.free > tight("2026-11-27", "2026-12-09"));
});

test("free minutes skip rough days and subtract busy time", () => {
  const f = freeMinutes(defaultPrefs, ["2026-11-01"], [{ date: "2026-11-02", start: "18:30", end: "19:30" }]);
  assert.equal(f("2026-11-01", "2026-11-01"), 0); // Sunday off
  assert.equal(f("2026-11-02", "2026-11-02"), 60); // 120 - 60 busy
});

test("planner aims at the chosen מועד and places weekly mock exams", () => {
  const exams: Exam[] = [
    { course_code: "20109", moed: "א", date: "2027-02-14", start_time: "09:00" },
    { course_code: "20109", moed: "ב", date: "2027-03-14", start_time: "09:00", chosen: true },
  ];
  assert.equal(nextExams(exams, TODAY)[0].moed, "ב");
  assert.equal(nextExams(exams.map((e) => ({ ...e, chosen: null })), TODAY)[0].moed, "א");
  const prefs = { ...defaultPrefs, availability: { ...defaultPrefs.availability, "5": { start: "09:00", minutes: 240 } } };
  const plan = buildPlan({ today: "2027-02-01", prefs, progress: {}, exams, courses: [course("20109")] });
  const mocks = plan.sessions.filter((s) => s.ref === "mock");
  assert.equal(mocks.length, 3);
  assert.ok(mocks.every((m) => m.minutes === 180 && m.date > "2027-02-14" && m.title.startsWith("בחינה לדוגמה")));
  // מועד א isn't taken: no exam revision before it, and that day is a normal study day
  assert.ok(plan.sessions.some((s) => s.date === "2027-02-14"));
  const noMocks = buildPlan({ today: "2027-02-01", prefs, progress: {}, exams: exams.map((e) => ({ ...e, mocks: false })), courses: [course("20109")] });
  assert.equal(noMocks.sessions.filter((s) => s.ref === "mock").length, 0);
});
