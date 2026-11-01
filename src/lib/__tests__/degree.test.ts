import { test } from "node:test";
import assert from "node:assert/strict";
import { autoPlan, cleanPlan, itemIssues, nextSemester, requirements, semIndex, totals, type DegreePlan } from "@/lib/degree";

const CURRENT = "2027א";

/** The owner's plan as agreed on 1.11.2026 (Sheilta draft 395269 + two swaps), 5 semesters to 2029ב; לינארית 2 ↔ לוגיקה swapped and 20554 → 2028ב later that day; 20937 ↔ 20551 after the official offering table (20937 runs ב+ג only). */
const plan: DegreePlan = {
  program: "AF",
  recognized: [{ label: "הכרה בלימודים קודמים — מדעים (140)", area: "science", credits: 9 }],
  settings: { perSemester: 16, summers: false, target: "2029ב", biblioDone: false, englishExempt: true, englishContent: 2, gradeTarget: 85 },
  items: [
    { code: "20441", sem: null, credited: true },
    { code: "20471", sem: null, credited: true },
    { code: "20465", sem: null, credited: true },
    { code: "20277", sem: "2022ג", passed: true },
    { code: "20476", sem: "2022ג", passed: true },
    { code: "20109", sem: "2027א" },
    { code: "20407", sem: "2027א" },
    { code: "20474", sem: "2027א" },
    { code: "20475", sem: "2027ב" },
    { code: "20417", sem: "2027ב" },
    { code: "20229", sem: "2028א" },
    { code: "20425", sem: "2028א" },
    { code: "20604", sem: "2028א" },
    { code: "20554", sem: "2028ב" },
    { code: "20594", sem: "2028ב" },
    { code: "20466", sem: "2027ב" },
    { code: "20905", sem: "2028ב" },
    { code: "20942", sem: "2028ב" },
    { code: "20937", sem: "2029ב" },
    { code: "20580", sem: "2029א" },
    { code: "20944", sem: "2029א" },
    { code: "20954", sem: "2029א" },
    { code: "20551", sem: "2029א" },
    { code: "20973", sem: "2029ב" },
  ],
};

test("semester arithmetic", () => {
  assert.equal(nextSemester("2027א"), "2027ב");
  assert.equal(nextSemester("2027ב"), "2027ג");
  assert.equal(nextSemester("2027ב", false), "2028א");
  assert.ok(semIndex("2028א") > semIndex("2027ג"));
});

test("the agreed plan meets every degree requirement", () => {
  const reqs = requirements(plan, CURRENT);
  const failed = reqs.filter((r) => !r.ok).map((r) => `${r.id} ${r.have}/${r.need}`);
  assert.deepEqual(failed, []);
  const by = Object.fromEntries(reqs.map((r) => [r.id, r]));
  assert.equal(by.total.have, 120);
  assert.equal(by.cs.have, 76);
  assert.equal(by.elective.have, 28);
  assert.equal(by.english.have, 2);
  assert.equal(totals(plan, CURRENT).done, 31); // 23 recognized + 8 done
});

test("the agreed plan has no placement errors once the bibliographic training is done", () => {
  const p = { ...plan, settings: { ...plan.settings, biblioDone: true } };
  for (const i of p.items) {
    const errs = itemIssues(p, i, CURRENT).filter((x) => x.severity === "error");
    assert.deepEqual(errs, [], i.code);
  }
});

test("prerequisite and offering errors are caught", () => {
  const bad: DegreePlan = { ...plan, settings: { ...plan.settings, biblioDone: true }, items: plan.items.map((i) => (i.code === "20425" ? { ...i, sem: "2027ב" } : i.code === "20580" ? { ...i, sem: "2028ב" } : i)) };
  const p425 = itemIssues(bad, bad.items.find((i) => i.code === "20425")!, CURRENT);
  assert.ok(p425.some((x) => x.severity === "error" && x.text.includes("חשבון אינפיניטסימלי 2")));
  // inside the official two-year table (2027א–2028ג): offered or not, no guessing
  const p580 = itemIssues(bad, bad.items.find((i) => i.code === "20580")!, CURRENT);
  assert.ok(p580.some((x) => x.severity === "error" && x.text.startsWith("לא נפתח ב")));
  // beyond it: the table's terms are "usually" — 20937 ran only in ב׳ and ג׳ in 2027–2028
  const p937 = itemIssues(bad, bad.items.find((i) => i.code === "20937")!, CURRENT);
  assert.ok(p937.some((x) => x.severity === "warn" && x.text.includes("בדרך כלל נפתח רק ב: ב׳, ג׳")));
});

test("the original draft's 20937 without 20554 is flagged", () => {
  const draft: DegreePlan = { ...plan, items: plan.items.filter((i) => i.code !== "20554") };
  const issues = itemIssues(draft, draft.items.find((i) => i.code === "20937")!, CURRENT);
  assert.ok(issues.some((x) => x.text.startsWith("חסר בתכנית תנאי קדם")));
});

test("autoPlan places everything legally within the cap", () => {
  const out = autoPlan({ ...plan, settings: { ...plan.settings, biblioDone: true } }, CURRENT);
  assert.equal(out.items.filter((i) => !i.sem && !i.credited).length, 0);
  const p = { ...out, settings: { ...out.settings, biblioDone: true } };
  for (const i of p.items) assert.deepEqual(itemIssues(p, i, CURRENT).filter((x) => x.severity === "error"), [], i.code);
  const per: Record<string, number> = {};
  for (const i of out.items) if (i.sem && semIndex(i.sem) > semIndex(CURRENT)) per[i.sem] = (per[i.sem] ?? 0) + 1;
  assert.ok(!Object.keys(per).some((s) => s.endsWith("ג")), "no summers");
  const last = Math.max(...out.items.filter((i) => i.sem).map((i) => semIndex(i.sem!)));
  assert.ok(last <= semIndex("2029ב"), `finishes by 2029ב, got ${last}`);
});

test("cleanPlan drops junk", () => {
  const c = cleanPlan({ items: [{ code: "20109", sem: "2027א" }, { code: "x", sem: "2027א" }, { code: "20109", sem: "2028א" }, { code: "20229", sem: "bad" }], settings: { perSemester: 99 } });
  assert.deepEqual(c.items, [{ code: "20109", sem: "2027א" }, { code: "20229", sem: null }]);
  assert.equal(c.settings.perSemester, 16);
});
