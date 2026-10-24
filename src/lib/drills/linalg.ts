/**
 * Linear Algebra drills with exact fractions: row reduction step by step (every step checked
 * against the operation chosen, and for row-equivalence), RREF check, 3×3 determinants.
 */
import { Frac, F } from "./fraction";
import { rng } from "./rng";

export type Matrix = Frac[][];
export type RowOp =
  | { t: "swap"; i: number; j: number }
  | { t: "scale"; i: number; c: Frac }
  | { t: "add"; i: number; j: number; c: Frac }; // R_i ← R_i + c·R_j

export const M = (rows: (number | Frac)[][]): Matrix => rows.map((r) => r.map((x) => Frac.of(x)));
export const clone = (A: Matrix): Matrix => A.map((r) => [...r]);
export const matEq = (A: Matrix, B: Matrix) => A.length === B.length && A.every((r, i) => r.length === B[i].length && r.every((x, j) => x.eq(B[i][j])));

export function applyOp(A: Matrix, op: RowOp): Matrix {
  const B = clone(A);
  if (op.t === "swap") [B[op.i], B[op.j]] = [B[op.j], B[op.i]];
  else if (op.t === "scale") {
    if (op.c.isZero()) throw new Error("כפל שורה באפס אינו פעולה אלמנטרית");
    B[op.i] = B[op.i].map((x) => x.mul(op.c));
  } else {
    if (op.i === op.j) throw new Error("צריך שתי שורות שונות");
    B[op.i] = B[op.i].map((x, k) => x.add(op.c.mul(A[op.j][k])));
  }
  return B;
}

/** The operation in the usual notation, rows 1-based: "R2 → R2 − 3R1". */
export function opLabel(op: RowOp): string {
  const R = (i: number) => `R${i + 1}`;
  if (op.t === "swap") return `${R(op.i)} ↔ ${R(op.j)}`;
  if (op.t === "scale") return `${R(op.i)} → ${coef(op.c)}${R(op.i)}`;
  const neg = op.c.sign() < 0;
  const c = neg ? op.c.neg() : op.c;
  return `${R(op.i)} → ${R(op.i)} ${neg ? "−" : "+"} ${coef(c)}${R(op.j)}`;
}
const coef = (c: Frac) => (c.isOne() ? "" : c.eq(-1) ? "−" : c.isInt() ? c.toString() : `(${c})`);

/** Reduced row echelon form (Gauss–Jordan), exact. */
export function rref(A: Matrix): Matrix {
  const B = clone(A);
  const rows = B.length;
  const cols = B[0]?.length ?? 0;
  let r = 0;
  for (let c = 0; c < cols && r < rows; c++) {
    let p = r;
    while (p < rows && B[p][c].isZero()) p++;
    if (p === rows) continue;
    [B[r], B[p]] = [B[p], B[r]];
    const inv = Frac.one.div(B[r][c]);
    B[r] = B[r].map((x) => x.mul(inv));
    for (let i = 0; i < rows; i++)
      if (i !== r && !B[i][c].isZero()) {
        const f = B[i][c];
        B[i] = B[i].map((x, k) => x.sub(f.mul(B[r][k])));
      }
    r++;
  }
  return B;
}

export const rowEquivalent = (A: Matrix, B: Matrix) => A.length === B.length && matEq(rref(A), rref(B));
export const rank = (A: Matrix) => rref(A).filter((r) => r.some((x) => !x.isZero())).length;

/** null when A is in RREF, otherwise a short Hebrew reason. */
export function rrefProblem(A: Matrix): string | null {
  let lastPivot = -1;
  let sawZero = false;
  for (let i = 0; i < A.length; i++) {
    const p = A[i].findIndex((x) => !x.isZero());
    if (p === -1) {
      sawZero = true;
      continue;
    }
    if (sawZero) return `שורת אפסים צריכה להיות מתחת לכל השורות האחרות (שורה ${i + 1}).`;
    if (p <= lastPivot) return `האיבר המוביל בשורה ${i + 1} צריך להיות מימין לזה שבשורה שמעליה.`;
    if (!A[i][p].isOne()) return `האיבר המוביל בשורה ${i + 1} צריך להיות 1.`;
    for (let k = 0; k < A.length; k++) if (k !== i && !A[k][p].isZero()) return `בעמודה ${p + 1} (של האיבר המוביל בשורה ${i + 1}) כל שאר האיברים צריכים להיות 0.`;
    lastPivot = p;
  }
  return null;
}

export interface StepCheck {
  ok: boolean;
  /** cells (row, col) where what was typed differs from the operation's result */
  wrong: [number, number][];
  /** typed matrix is still row-equivalent to the previous one (even if not what the op gives) */
  equivalent: boolean;
  expected: Matrix;
}

/** Checks a typed matrix against the result of applying op to prev. */
export function checkStep(prev: Matrix, op: RowOp, typed: Matrix): StepCheck {
  const expected = applyOp(prev, op);
  const wrong: [number, number][] = [];
  expected.forEach((r, i) => r.forEach((x, j) => !typed[i]?.[j]?.eq(x) && wrong.push([i, j])));
  return { ok: wrong.length === 0, wrong, equivalent: wrong.length === 0 || rowEquivalent(prev, typed), expected };
}

export interface ReduceDrill {
  kind: "rref";
  start: Matrix;
  /** columns after the bar (augmented matrix), 0 for a plain matrix */
  aug: number;
  answer: Matrix;
}

/**
 * A small integer matrix that reduces cleanly: a random RREF target (integer entries) scrambled by
 * a few integer row operations with determinant ±1, so entries stay small integers.
 */
export function genReduceDrill(seed: number): ReduceDrill {
  const r = rng(seed);
  const rows = 3;
  const augmented = r.next() < 0.6;
  const cols = augmented ? 4 : 3;
  for (let attempt = 0; ; attempt++) {
    const deficient = r.next() < 0.25;
    const T: Matrix = Array.from({ length: rows }, () => Array.from({ length: cols }, () => Frac.zero));
    // pivots in columns 0,1,2 (or 0,1 / 0,2 when rank-deficient)
    const pivots = deficient ? r.pick([[0, 1], [0, 2]]) : [0, 1, 2];
    pivots.forEach((c, i) => {
      T[i][c] = Frac.one;
      for (let k = c + 1; k < cols; k++) if (!pivots.includes(k)) T[i][k] = F(r.int(-3, 3));
    });
    let A = T;
    const nOps = r.int(4, 6);
    for (let s = 0; s < nOps; s++) {
      const i = r.int(0, rows - 1);
      let j = r.int(0, rows - 1);
      if (j === i) j = (i + 1) % rows;
      A = r.next() < 0.15 ? applyOp(A, { t: "swap", i, j }) : applyOp(A, { t: "add", i, j, c: F(r.pick([-2, -1, 1, 2, 3])) });
    }
    const max = Math.max(...A.flat().map((x) => Math.abs(x.toNumber())));
    const firstColNonzero = A.some((row) => !row[0].isZero());
    const alreadyReduced = rrefProblem(A) === null;
    if ((max <= 9 && firstColNonzero && !alreadyReduced) || attempt > 40)
      return { kind: "rref", start: A, aug: augmented ? 1 : 0, answer: rref(A) };
  }
}

export function det(A: Matrix): Frac {
  const n = A.length;
  if (n === 1) return A[0][0];
  if (n === 2) return A[0][0].mul(A[1][1]).sub(A[0][1].mul(A[1][0]));
  let s = Frac.zero;
  for (let j = 0; j < n; j++) {
    const minor = A.slice(1).map((row) => row.filter((_, k) => k !== j));
    const term = A[0][j].mul(det(minor));
    s = j % 2 ? s.sub(term) : s.add(term);
  }
  return s;
}

export interface DetDrill {
  kind: "det";
  A: Matrix;
  answer: Frac;
}

export function genDetDrill(seed: number): DetDrill {
  const r = rng(seed);
  const A = M(Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => r.int(-4, 5))));
  return { kind: "det", A, answer: det(A) };
}
