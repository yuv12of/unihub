import { test } from "node:test";
import assert from "node:assert/strict";
import { mathRuns } from "@/lib/mathRuns";

const math = (t: string) => mathRuns(t).filter((r) => r.math).map((r) => r.text);
const joined = (t: string) => mathRuns(t).map((r) => r.text).join("");

test("never loses or reorders characters", () => {
  for (const t of ["לכל x ≥ −1 ולכל n טבעי: (1+x)^n ≥ 1+nx.", "(למשל x > 0)", "ש־ℚ צפופה ב־ℝ", "m² = 2n² ⇒ m זוגי ⇒ n זוגי, סתירה."])
    assert.equal(joined(t), t);
});

test("whole formulas with spaces are one run", () => {
  assert.deepEqual(math("לכל x ≥ −1 ולכל n טבעי: (1+x)^n ≥ 1+nx."), ["x ≥ −1", "n", "(1+x)^n ≥ 1+nx"]);
  assert.deepEqual(math("|a| < r ⇔ −r < a < r; |ab| = |a||b|"), ["|a| < r ⇔ −r < a < r; |ab| = |a||b|"]);
});

test("symbols the old list missed: ℝ ℚ ⇒ ² ⌊⌋ Θ", () => {
  assert.deepEqual(math("m² = 2n² ⇒ m זוגי"), ["m² = 2n² ⇒ m"]);
  assert.deepEqual(math("ℚ צפופה ב־ℝ"), ["ℚ", "ℝ"]);
  assert.deepEqual(math("מכאן ⌊x⌋ ≤ x < ⌊x⌋+1 לכל x"), ["⌊x⌋ ≤ x < ⌊x⌋+1", "x"]);
  assert.deepEqual(math("זמן ריצה Θ(n lg n) במקרה הגרוע"), ["Θ(n lg n)"]);
});

test("a Hebrew prefix with maqaf is split off", () => {
  const r = mathRuns("ב־1+x");
  assert.deepEqual(r, [
    { math: false, text: "ב־" },
    { math: true, text: "1+x" },
  ]);
  assert.deepEqual(math("קטן מ־1/n"), ["1/n"]);
});

test("sentence punctuation and outer brackets stay outside", () => {
  assert.deepEqual(math("(למשל x > 0)"), ["x > 0"]);
  assert.deepEqual(mathRuns("(למשל x > 0)").at(-1), { math: false, text: ")" });
  assert.deepEqual(math("הפונקציה f(x)."), ["f(x)"]);
  assert.deepEqual(math("הקבוצה {(1,0),(0,1)} היא בסיס של R^2."), ["{(1,0),(0,1)}", "R^2"]);
});

test("punctuation alone stays Hebrew", () => {
  assert.deepEqual(math("שאלה — תשובה, כן."), []);
  assert.deepEqual(math("a, b ו־c"), ["a, b", "c"]);
});
