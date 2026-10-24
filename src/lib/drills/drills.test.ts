/** Unit tests for the drill generators. Run: node scripts/test-drills.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Frac, F } from "./fraction";
import { parseIntList } from "./rng";
import { buildMaxHeap, buildMaxHeapSteps, bstFrom, chainTable, genBuildHeapDrill, genChainDrill, genHeapDrill, genProbeDrill, heapExtractMax, heapInsert, isMaxHeap, probeTable, traverse } from "./ds";
import { applyOp, checkStep, det, genDetDrill, genReduceDrill, M, matEq, rref, rrefProblem, rowEquivalent } from "./linalg";
import { checkDeriv, checkLimit, evalExpr, genDerivDrill, genLimitDrill, parseExpr, rationalLimit, sameFunction } from "./calc";
import { pickMix, pretestPick } from "../practice";

test("fractions are exact and parse what people type", () => {
  assert.equal(F(1, 3).add(F(1, 6)).toString(), "1/2");
  assert.equal(F(2, -4).toString(), "-1/2");
  assert.ok(Frac.parse("3/4")!.eq(F(3, 4)));
  assert.ok(Frac.parse(" -6 / 8 ")!.eq(F(-3, 4)));
  assert.ok(Frac.parse("1.25")!.eq(F(5, 4)));
  assert.ok(Frac.parse("−2")!.eq(F(-2)));
  assert.equal(Frac.parse("abc"), null);
  assert.equal(Frac.parse("1/0"), null);
  assert.deepEqual(parseIntList("5, 3 2;7"), [5, 3, 2, 7]);
  assert.equal(parseIntList("5, x"), null);
});

test("heap operations follow CLRS", () => {
  // CLRS figure 6.3: BUILD-MAX-HEAP on 4 1 3 2 16 9 10 14 8 7
  assert.deepEqual(buildMaxHeap([4, 1, 3, 2, 16, 9, 10, 14, 8, 7]), [16, 14, 10, 8, 7, 9, 3, 2, 4, 1]);
  assert.equal(buildMaxHeapSteps([4, 1, 3, 2, 16, 9, 10, 14, 8, 7]).length, 5);
  // CLRS figure 6.5 (HEAP-INCREASE-KEY 4→15 behaves like inserting 15)
  assert.deepEqual(heapInsert([16, 14, 10, 8, 7, 9, 3, 2, 4], 15), [16, 15, 10, 8, 14, 9, 3, 2, 4, 7]);
  const { max, heap } = heapExtractMax([16, 14, 10, 8, 7, 9, 3, 2, 4, 1]);
  assert.equal(max, 16);
  assert.deepEqual(heap, [14, 8, 10, 4, 7, 9, 3, 2, 1]);
  for (let s = 1; s < 50; s++) {
    const d = genHeapDrill(s);
    assert.ok(isMaxHeap(d.start));
    d.steps.forEach((st) => assert.ok(isMaxHeap(st.expected)));
    const b = genBuildHeapDrill(s);
    assert.ok(isMaxHeap(b.steps[b.steps.length - 1].expected));
  }
});

test("BST traversals and hashing", () => {
  const t = bstFrom([15, 6, 18, 3, 7, 17, 20, 2, 4, 13, 9]);
  assert.deepEqual(traverse(t, "in"), [2, 3, 4, 6, 7, 9, 13, 15, 17, 18, 20]);
  assert.deepEqual(traverse(t, "pre"), [15, 6, 3, 2, 4, 7, 13, 9, 18, 17, 20]);
  assert.deepEqual(traverse(t, "post"), [2, 4, 3, 9, 13, 7, 6, 17, 20, 18, 15]);
  assert.deepEqual(traverse(t, "level"), [15, 6, 18, 3, 7, 17, 20, 2, 4, 13, 9]);
  // CLRS exercise 11.2-2: 5 28 19 15 20 33 12 17 10, m = 9, insert at head
  const T = chainTable([5, 28, 19, 15, 20, 33, 12, 17, 10], 9);
  assert.deepEqual(T[1], [10, 19, 28]);
  assert.deepEqual(T[6], [33, 15]);
  // CLRS exercise 11.4-1 (linear probing, m = 11, h'(k) = k mod 11)
  const { table } = probeTable([10, 22, 31, 4, 15, 28, 17, 88, 59], 11);
  assert.deepEqual(table, [22, 88, null, null, 4, 15, 28, 17, 59, 31, 10]);
  for (let s = 1; s < 30; s++) {
    assert.ok(genChainDrill(s).expected.some((c) => c.length > 1));
    const p = genProbeDrill(s);
    assert.equal(p.expected.filter((x) => x !== null).length, p.keys.length);
  }
});

test("row reduction is exact and steps are checked", () => {
  const A = M([[2, 4, -2], [4, 9, -3], [-2, -3, 7]]);
  assert.ok(matEq(rref(A), M([[1, 0, 0], [0, 1, 0], [0, 0, 1]])));
  const op = { t: "add" as const, i: 1, j: 0, c: F(-2) };
  const next = applyOp(A, op);
  assert.ok(matEq(next, M([[2, 4, -2], [0, 1, 1], [-2, -3, 7]])));
  const typo = M([[2, 4, -2], [0, 1, 2], [-2, -3, 7]]);
  const chk = checkStep(A, op, typo);
  assert.equal(chk.ok, false);
  assert.deepEqual(chk.wrong, [[1, 2]]);
  assert.equal(chk.equivalent, true); // both invertible: any slip still row-equivalent
  const B = M([[1, 2, 3], [2, 4, 7]]);
  const bad = checkStep(B, { t: "add", i: 1, j: 0, c: F(-2) }, M([[1, 2, 3], [0, 1, 1]]));
  assert.equal(bad.ok, false);
  assert.equal(bad.equivalent, false);
  assert.equal(checkStep(A, op, next).ok, true);
  assert.equal(checkStep(A, { t: "scale", i: 0, c: F(1, 2) }, M([[1, 2, -1], [4, 9, -3], [-2, -3, 7]])).ok, true);
  assert.match(rrefProblem(M([[1, 2], [0, 3]]))!, /1/);
  assert.equal(rrefProblem(M([[1, 0, 2], [0, 1, -1], [0, 0, 0]])), null);
  assert.ok(rrefProblem(M([[0, 0, 0], [1, 0, 0]])));
  for (let s = 1; s < 60; s++) {
    const d = genReduceDrill(s);
    assert.ok(rowEquivalent(d.start, d.answer));
    assert.equal(rrefProblem(d.answer), null);
    assert.ok(d.start.flat().every((x) => x.isInt()));
  }
});

test("determinants", () => {
  assert.ok(det(M([[1, 2, 3], [4, 5, 6], [7, 8, 10]])).eq(-3));
  assert.ok(det(M([[2, 0, 0], [0, 3, 0], [0, 0, 4]])).eq(24));
  const d = genDetDrill(7);
  assert.ok(d.answer.isInt());
});

test("expressions, derivatives and limits", () => {
  assert.equal(evalExpr(parseExpr("2x^2 + 3x - 1"), 2), 13);
  assert.ok(Math.abs(evalExpr(parseExpr("3sin(x)cos(x)"), 1) - 3 * Math.sin(1) * Math.cos(1)) < 1e-12);
  assert.ok(Math.abs(evalExpr(parseExpr("e^(2x)"), 1) - Math.exp(2)) < 1e-12);
  assert.ok(Math.abs(evalExpr(parseExpr("sin^2(x) + cos^2 x"), 0.7) - 1) < 1e-12);
  assert.equal(evalExpr(parseExpr("x^-1"), 4), 0.25);
  assert.ok(sameFunction("2x*cos(x^2)", "2x cos(x^2)").ok);
  assert.ok(!sameFunction("2x*cos(x)", "2x cos(x^2)").ok);
  assert.ok(sameFunction("(1+x)^2", "x^2+2x+1").ok);
  assert.ok(sameFunction("2 x (", "x").error);
  // every generated derivative answer matches a finite-difference derivative of f
  for (let s = 1; s < 120; s++) {
    const d = genDerivDrill(s);
    const f = parseExpr(d.f);
    const g = parseExpr(d.answer);
    for (const x of [0.6, 1.3, 2.1]) {
      const h = 1e-5;
      const num = (evalExpr(f, x + h) - evalExpr(f, x - h)) / (2 * h);
      const want = evalExpr(g, x);
      if (!Number.isFinite(num)) continue;
      assert.ok(Math.abs(num - want) <= 1e-3 * Math.max(1, Math.abs(want)), `seed ${s}: ${d.f} → ${d.answer} at ${x}: ${num} vs ${want}`);
    }
    assert.ok(checkDeriv(d, d.answer).ok);
  }
  assert.deepEqual(rationalLimit([1, 0, 3], [2, 1, 6]), { value: F(1, 2) });
  assert.deepEqual(rationalLimit([1, 2], [0, 0, 1]), { value: Frac.zero });
  assert.deepEqual(rationalLimit([0, 0, -2], [1, 1]), { inf: -1 });
  assert.ok(checkLimit({ value: F(1, 2) }, "2/4").ok);
  assert.ok(checkLimit({ value: F(1, 2) }, "0.5").ok);
  assert.ok(checkLimit({ inf: 1 }, "∞").ok);
  assert.ok(!checkLimit({ inf: 1 }, "-inf").ok);
  for (let s = 1; s < 40; s++) {
    const l = genLimitDrill(s);
    if ("value" in l.answer) {
      const at = evalExpr(parseExpr(l.expr, "n"), 1e6);
      assert.ok(Math.abs(at - l.answer.value.toNumber()) < 1e-3, `seed ${s}: ${l.expr}`);
    }
  }
});

test("mix and pretest picking", () => {
  const qs = Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, chapter_id: `c${i % 4}`, difficulty: (i % 3) + 1 }));
  const chapters = [0, 1, 2, 3].map((i) => ({ id: `c${i}`, title: `פרק ${i}`, course_code: i < 2 ? "20109" : "20474", opened: i !== 3 }));
  const mix = pickMix(qs, chapters, 10, 42);
  assert.ok(mix.length <= 10 && mix.length > 0);
  assert.ok(mix.every((m) => m.chapter_id !== "c3"));
  assert.ok(mix.every((m) => m.choices.length >= 2 && m.choices.includes(m.chapter_id)));
  assert.equal(new Set(mix.map((m) => m.id)).size, mix.length);
  const pre = pretestPick([
    { id: "a", difficulty: 3, idx: 0 },
    { id: "b", difficulty: 1, idx: 1 },
    { id: "c", difficulty: 2, idx: 2 },
  ]);
  assert.deepEqual(pre, ["b", "c"]);
});
