import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, type DegreePlan } from "@/lib/degree";
import { applySync, parseSheilta, registrationDiff, statusFrom } from "@/lib/sheilta";
import { registrationPushes, registrationStates, registrationWindow, regPhase } from "@/lib/registration";
import { examLoad, sittingsFor } from "@/lib/examLoad";
import { gradeSummary } from "@/lib/grades";

const CURRENT = "2027א";
const base = (): DegreePlan => ({
  program: "AF",
  recognized: [{ label: "הכרה", area: "science", credits: 9 }],
  settings: { ...DEFAULT_SETTINGS, target: "2029ב" },
  items: [
    { code: "20441", sem: null, credited: true },
    { code: "20277", sem: "2022ג" },
    { code: "20476", sem: "2022ג" },
    { code: "20109", sem: "2027א" },
    { code: "20475", sem: "2027ב" },
    { code: "20466", sem: "2027ב" },
    { code: "20229", sem: "2028א" },
    { code: "20594", sem: "2028ב" },
  ],
});

// Shaped like Sheilta's endpoint (compact rows from the bookmarklet); grades are made up.
const ROWS = [
  ["20109", "אלגברה לינארית 1", "2027א", "2", "בלימוד", "", "", ""],
  ["20466", "לוגיקה למדעי המחשב", "2026א", "13", "אי עמידה בדרישות", "", "", ""],
  ["20229", "אלגברה לינארית 2", "2025ג", "13", "אי עמידה בדרישות", "", "", ""],
  ["20109", "אלגברה לינארית 1", "2025ב", "4", "הרשמה מחדש", "", "40", ""],
  ["20423", "חשבון דיפרנציאלי ואינטגרלי ב", "2025ג", "13", "אי עמידה בדרישות", "", "", ""],
  ["20277", "מערכות בסיסי-נתונים", "2022ג", "1", "הצלחה", "80", "79", "4"],
  ["20476", "מתמטיקה בדידה", "2022ג", "1", "הצלחה", "92", "90", "4"],
  ["20475", "חשבון אינפיניטסימלי 2", "2027ב", "", "", "", "", ""],
  ["20417", "אלגוריתמים", "2027ב", "", "", "", "", ""],
  ["bad", "x", "2027ב"],
];

test("statuses from Sheilta codes and names", () => {
  assert.equal(statusFrom("1", "הצלחה", "2022ג", CURRENT), "passed");
  assert.equal(statusFrom("13", "אי עמידה בדרישות", "2026א", CURRENT), "failed");
  assert.equal(statusFrom("4", "הרשמה מחדש", "2025ב", CURRENT), "retaken");
  assert.equal(statusFrom("2", "בלימוד", "2027א", CURRENT), "studying");
  assert.equal(statusFrom("", "", "2027ב", CURRENT), "registered");
});

test("parses compact rows and the raw endpoint JSON", () => {
  const r = parseSheilta(ROWS, CURRENT);
  assert.equal(r.length, 9);
  assert.deepEqual(r.find((x) => x.code === "20277"), { code: "20277", name: "מערכות בסיסי-נתונים", sem: "2022ג", status: "passed", statusName: "הצלחה", grade: 80, exam: 79, credits: 4 });
  const raw = [{ courseId: "20476", courseName: "מתמטיקה בדידה", semester: "2022ג", finalGrade: "92", examGrade: "90", points: "4", innerStudentCourse: { studyStatus: { calculatedStatusCode: "1", calculatedStatusName: "הצלחה" } } }];
  assert.equal(parseSheilta(JSON.stringify(raw), CURRENT)[0].grade, 92);
  assert.deepEqual(parseSheilta("not json", CURRENT), []);
});

test("sync: passes get grades, old failures before the planned retake change nothing", () => {
  const { plan, changes } = applySync(base(), parseSheilta(ROWS, CURRENT), CURRENT);
  const by = Object.fromEntries(plan.items.map((i) => [i.code, i]));
  assert.equal(by["20277"].grade, 80);
  assert.equal(by["20277"].passed, true);
  assert.equal(by["20476"].grade, 92);
  // לוגיקה failed in 2026א but is planned again for 2027ב: stays
  assert.equal(by["20466"].sem, "2027ב");
  assert.equal(by["20229"].sem, "2028א");
  // registered for אלגוריתמים, which the plan doesn't have: not added (registration check shows it)
  assert.equal(by["20417"], undefined);
  // an old course outside AF that never passed is ignored
  assert.equal(by["20423"], undefined);
  assert.deepEqual(changes.map((c) => c.code).sort(), ["20277", "20476"]);
  // a second sync changes nothing
  assert.deepEqual(applySync(plan, parseSheilta(ROWS, CURRENT), CURRENT).changes, []);
});

test("sync: a failed current attempt goes back to unplaced; a later pass comes back done", () => {
  const failed = [["20109", "אלגברה לינארית 1", "2027א", "13", "אי עמידה בדרישות", "", "45", ""]];
  const { plan, changes } = applySync(base(), parseSheilta(failed, "2027ב"), "2027ב");
  const item = plan.items.find((i) => i.code === "20109")!;
  assert.equal(item.sem, null);
  assert.equal(item.failedIn, "2027א");
  assert.equal(changes[0].kind, "failed");
  const passed = [["20109", "אלגברה לינארית 1", "2027ג", "1", "הצלחה", "77", "75", "7"]];
  const again = applySync(plan, parseSheilta(passed, "2028א"), "2028א").plan.items.find((i) => i.code === "20109")!;
  assert.deepEqual([again.sem, again.passed, again.grade, again.failedIn], ["2027ג", true, 77, undefined]);
});

test("sync: unplaced course registered in Sheilta gets placed; outside courses that passed are added", () => {
  const p = base();
  p.items.find((i) => i.code === "20475")!.sem = null;
  const rows = [
    ["20475", "חשבון אינפיניטסימלי 2", "2027ב", "", "", "", "", ""],
    ["10111", "קורס מחוץ לתכנית", "2024א", "1", "הצלחה", "88", "", "3"],
  ];
  const { plan } = applySync(p, parseSheilta(rows, CURRENT), CURRENT);
  assert.equal(plan.items.find((i) => i.code === "20475")!.sem, "2027ב");
  assert.deepEqual(plan.items.find((i) => i.code === "10111"), { code: "10111", sem: "2024א", passed: true, grade: 88, name: "קורס מחוץ לתכנית", credits: 3 });
});

test("registration diff: planned vs registered, and registrations the plan doesn't have", () => {
  const snap = { syncedAt: "2026-11-01T10:00:00Z", records: parseSheilta(ROWS, CURRENT) };
  const d = registrationDiff(base(), snap, "2027ב");
  assert.deepEqual(d.rows, [
    { code: "20475", name: "חשבון אינפיניטסימלי 2", registered: true },
    { code: "20466", name: "לוגיקה למדעי המחשב", registered: false },
  ]);
  assert.deepEqual(d.extra, [{ code: "20417", name: "אלגוריתמים", plannedIn: null }]);
  assert.equal(registrationDiff(base(), null, "2027ב").rows[0].registered, null);
});

test("registration windows: published and estimated", () => {
  const w = registrationWindow("2027ב")!;
  assert.deepEqual([w.regular, w.late[1], w.estimated], [["2026-11-01", "2026-12-29"], "2027-02-12", false]);
  const e = registrationWindow("2028ב")!;
  assert.equal(e.estimated, true);
  assert.equal(e.regular[0], "2027-10-31"); // 364 days later: the same weekday (Sunday)
  assert.equal(new Date(e.regular[0] + "T12:00:00Z").getUTCDay(), new Date(w.regular[0] + "T12:00:00Z").getUTCDay());
  assert.equal(regPhase(w, "2026-10-31"), "before");
  assert.equal(regPhase(w, "2026-11-01"), "regular");
  assert.equal(regPhase(w, "2027-01-10"), "late");
  assert.equal(regPhase(w, "2027-03-01"), "last");
  assert.equal(regPhase(w, "2027-03-06"), "closed");
});

test("registration states and pushes", () => {
  const snap = { syncedAt: "2026-11-01T10:00:00Z", records: parseSheilta(ROWS, CURRENT) };
  const st = registrationStates(base(), snap, "2026-11-01");
  assert.deepEqual(st.map((s) => [s.window.sem, s.phase, s.missing]), [["2027ב", "regular", 1]]);
  const open = registrationPushes(base(), snap, { date: "2026-11-01", minutes: 10 * 60 });
  assert.deepEqual(open.map((p) => p.key), ["reg|2027ב|open"]);
  assert.deepEqual(registrationPushes(base(), snap, { date: "2026-11-01", minutes: 8 * 60 }), []);
  const week = registrationPushes(base(), snap, { date: "2026-12-22", minutes: 12 * 60 });
  assert.deepEqual(week.map((p) => p.key), ["reg|2027ב|week"]);
  assert.match(week[0].body, /לוגיקה/);
  // everything registered: no reminders
  const all = { ...snap, records: [...snap.records, ...parseSheilta([["20466", "לוגיקה", "2027ב", "", "", "", "", ""]], CURRENT)] };
  assert.deepEqual(registrationPushes(base(), all, { date: "2026-12-29", minutes: 12 * 60 }), []);
});

test("exam load: estimated from the number of exams, then from real dates", () => {
  assert.equal(sittingsFor("2027ב")!.a.length, 11);
  assert.equal(sittingsFor("2029ב")!.estimated, true);
  const p = base();
  p.items.push({ code: "20417", sem: "2027ב" }, { code: "20425", sem: "2027ב" }, { code: "20973", sem: "2027ב" });
  const est = examLoad(p, "2027ב")!;
  assert.equal(est.courses.length, 4); // the workshop has no exam
  assert.equal(est.level, "busy");
  const known = [
    { course_code: "20475", date: "2027-07-12", moed: "א" },
    { course_code: "20417", date: "2027-07-15", moed: "א", chosen: true },
    { course_code: "20417", date: "2027-07-01", moed: "א" },
    { course_code: "20466", date: "2027-07-26", moed: "א" },
    { course_code: "20425", date: "2027-07-28", moed: "א" },
  ];
  const real = examLoad(p, "2027ב", known)!;
  assert.deepEqual(real.close.map((c) => c.days), [3, 2]);
  assert.equal(real.level, "heavy");
});

test("grade average: OU weights, needed grade for a target, projection", () => {
  const p = base();
  for (const i of p.items) {
    if (i.code === "20277") Object.assign(i, { passed: true, grade: 80 });
    if (i.code === "20476") Object.assign(i, { passed: true, grade: 90 });
    if (i.code === "20594") i.expected = 95;
  }
  const g = gradeSummary(p, CURRENT);
  assert.equal(g.average, 85);
  assert.equal(g.weightDone, 8);
  // remaining: 20109 (7), 20475 (7), 20466 (4), 20229 (5), 20594 advanced 4×1.5 = 6
  assert.equal(g.weightLeft, 29);
  assert.equal(g.needed, 85);
  assert.equal(g.projected, round((80 * 4 + 90 * 4 + 95 * 6) / 14));
  assert.equal(g.projectedComplete, false);
});
const round = (n: number) => Math.round(n * 10) / 10;
