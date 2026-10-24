/**
 * Calculus drills checked numerically: a tiny expression parser/evaluator (x or n, + − * / ^,
 * implicit multiplication, sin cos tan exp ln sqrt …), derivative drills compared at sample points,
 * and limits of rational sequences (exact, with fractions).
 */
import { Frac, F } from "./fraction";
import { rng } from "./rng";

// ---------- expressions ----------

type Node =
  | { t: "num"; v: number }
  | { t: "var" }
  | { t: "neg"; a: Node }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "^"; a: Node; b: Node }
  | { t: "fn"; f: string; a: Node };

const FNS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  cot: (v) => 1 / Math.tan(v),
  exp: Math.exp,
  ln: Math.log,
  log: Math.log,
  sqrt: Math.sqrt,
  arctan: Math.atan,
  arcsin: Math.asin,
  arccos: Math.acos,
  abs: Math.abs,
};

type Tok = { k: "num"; v: number } | { k: "id"; v: string } | { k: "op"; v: string };

function lex(src: string): Tok[] {
  const s = src
    .replace(/[−–]/g, "-")
    .replace(/[×·⋅]/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/\*\*/g, "^")
    .toLowerCase();
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) i++;
    else if (/[0-9.]/.test(c)) {
      const m = s.slice(i).match(/^\d*\.?\d+|^\d+\./)!;
      out.push({ k: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-z]/.test(c)) {
      const m = s.slice(i).match(/^[a-z]+/)![0];
      // split runs like "xsin" or "2xe" into known names and single letters
      let j = 0;
      while (j < m.length) {
        const name = ["arcsin", "arccos", "arctan", "sqrt", "sin", "cos", "tan", "cot", "exp", "abs", "ln", "log", "pi"].find((f) => m.startsWith(f, j));
        if (name) {
          out.push({ k: "id", v: name });
          j += name.length;
        } else {
          out.push({ k: "id", v: m[j] });
          j++;
        }
      }
      i += m.length;
    } else if ("+-*/^()".includes(c)) {
      out.push({ k: "op", v: c });
      i++;
    } else throw new Error(`תו לא מוכר: ${c}`);
  }
  return out;
}

/** Parses an expression in one variable (x, or n for sequences). Throws a Hebrew message on error. */
export function parseExpr(src: string, variable: "x" | "n" = "x"): Node {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.k === "op" && peek()!.v === v;
  const startsAtom = () => {
    const t = peek();
    return !!t && (t.k === "num" || t.k === "id" || (t.k === "op" && t.v === "("));
  };

  const expr = (): Node => {
    let a = term();
    while (isOp("+") || isOp("-")) {
      const op = (toks[p++] as { v: "+" | "-" }).v;
      a = { t: "bin", op, a, b: term() };
    }
    return a;
  };
  const term = (): Node => {
    let a = unary();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = (toks[p++] as { v: "*" | "/" }).v;
        a = { t: "bin", op, a, b: unary() };
      } else if (startsAtom()) a = { t: "bin", op: "*", a, b: power() }; // implicit: 2x, x(x+1), 3sin(x)
      else return a;
    }
  };
  const unary = (): Node => {
    if (isOp("-")) {
      p++;
      return { t: "neg", a: unary() };
    }
    if (isOp("+")) {
      p++;
      return unary();
    }
    return power();
  };
  const power = (): Node => {
    const base = atom();
    if (isOp("^")) {
      p++;
      return { t: "bin", op: "^", a: base, b: unary() }; // right-assoc; allows x^-1
    }
    return base;
  };
  const atom = (): Node => {
    const t = toks[p++];
    if (!t) throw new Error("הביטוי נגמר באמצע");
    if (t.k === "num") return { t: "num", v: t.v };
    if (t.k === "op" && t.v === "(") {
      const e = expr();
      if (!isOp(")")) throw new Error("חסר סוגר");
      p++;
      return e;
    }
    if (t.k === "id") {
      if (t.v === variable) return { t: "var" };
      if (t.v === "e") return { t: "num", v: Math.E };
      if (t.v === "pi") return { t: "num", v: Math.PI };
      if (FNS[t.v]) {
        // sin^2(x) → (sin(x))^2
        let pow: Node | null = null;
        if (isOp("^")) {
          p++;
          pow = atom();
        }
        const arg = isOp("(") ? atom() : power();
        const f: Node = { t: "fn", f: t.v, a: arg };
        return pow ? { t: "bin", op: "^", a: f, b: pow } : f;
      }
      throw new Error(`לא מכיר את "${t.v}"`);
    }
    throw new Error(`לא צפוי: ${t.v}`);
  };

  const e = expr();
  if (p < toks.length) throw new Error("יש משהו מיותר בסוף הביטוי");
  return e;
}

export function evalExpr(e: Node, x: number): number {
  switch (e.t) {
    case "num":
      return e.v;
    case "var":
      return x;
    case "neg":
      return -evalExpr(e.a, x);
    case "fn":
      return FNS[e.f](evalExpr(e.a, x));
    case "bin": {
      const a = evalExpr(e.a, x);
      const b = evalExpr(e.b, x);
      return e.op === "+" ? a + b : e.op === "-" ? a - b : e.op === "*" ? a * b : e.op === "/" ? a / b : Math.pow(a, b);
    }
  }
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * Whether two expressions agree at sample points where the reference is defined. Needs at least 4
 * usable points. Returns "parse" with the message when the answer doesn't parse.
 */
export function sameFunction(answer: string, reference: string, points = [0.37, 0.81, 1.23, 1.71, 2.29, 2.83, 3.41]): { ok: boolean; error?: string } {
  let a: Node;
  try {
    a = parseExpr(answer);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const r = parseExpr(reference);
  let used = 0;
  for (const x of points) {
    const want = evalExpr(r, x);
    if (!Number.isFinite(want)) continue;
    const got = evalExpr(a, x);
    if (!Number.isFinite(got) || !close(got, want)) return { ok: false };
    used++;
  }
  return { ok: used >= 4 };
}

// ---------- derivatives ----------

export interface DerivDrill {
  kind: "deriv";
  f: string;
  /** one correct derivative, in the same syntax the input accepts */
  answer: string;
  rule: string;
}

const sgn = (n: number, first = false) => (n < 0 ? (first ? "-" : " - ") : first ? "" : " + ");
const cx = (n: number, s: string, first = false) => `${sgn(n, first)}${Math.abs(n) === 1 && s ? "" : Math.abs(n)}${s}`;

export function genDerivDrill(seed: number): DerivDrill {
  const r = rng(seed);
  const a = r.pick([1, 2, 3, 4, 5, -2, -3]);
  const b = r.pick([1, 2, 3, -1, -4, 5]);
  const k = r.pick([2, 3, 4]);
  const n = r.pick([2, 3, 4, 5]);
  switch (r.int(0, 8)) {
    case 0: {
      const c = r.int(-6, 6);
      const m = n === 2 ? 3 : n;
      return { kind: "deriv", f: `${cx(a, `x^${m}`, true)}${cx(b, "x^2")}${c ? cx(c, "x") : ""}${cx(7, "")}`, answer: `${a * m}x^${m - 1} + ${2 * b}x + ${c}`, rule: "פולינום: (x^n)' = n·x^(n-1)" };
    }
    case 1:
      return { kind: "deriv", f: `(${cx(a, "x", true)}${cx(b, "")})sin(x)`, answer: `${a}sin(x) + (${a}x + ${b})cos(x)`, rule: "כלל המכפלה: (uv)' = u'v + uv'" };
    case 2:
      return { kind: "deriv", f: `x^${n}e^(${k}x)`, answer: `${n}x^${n - 1}e^(${k}x) + ${k}x^${n}e^(${k}x)`, rule: "מכפלה + שרשרת: (e^(kx))' = k·e^(kx)" };
    case 3:
      return { kind: "deriv", f: `(${cx(a, "x^2", true)}${cx(b, "")})^${n}`, answer: `${n}(${a}x^2 + ${b})^${n - 1} * ${2 * a}x`, rule: "כלל השרשרת: (u^n)' = n·u^(n-1)·u'" };
    case 4: {
      const aa = Math.abs(a);
      const bb = Math.abs(b);
      return { kind: "deriv", f: `ln(${cx(aa, "x^2", true)} + ${bb})`, answer: `${2 * aa}x/(${aa}x^2 + ${bb})`, rule: "(ln u)' = u'/u" };
    }
    case 5: {
      const c = r.pick([1, 2, 4, 9]);
      return { kind: "deriv", f: `(${cx(a, "x", true)}${cx(b, "")})/(x^2 + ${c})`, answer: `(${a}(x^2 + ${c}) - (${a}x + ${b})*2x)/(x^2 + ${c})^2`, rule: "כלל המנה: (u/v)' = (u'v − uv')/v²" };
    }
    case 6: {
      const aa = Math.abs(a);
      const bb = Math.abs(b);
      return { kind: "deriv", f: `sqrt(${cx(aa, "x", true)} + ${bb})`, answer: `${aa}/(2sqrt(${aa}x + ${bb}))`, rule: "(√u)' = u'/(2√u)" };
    }
    case 7:
      return { kind: "deriv", f: `sin(${cx(a, "x^2", true)})`, answer: `${2 * a}x*cos(${a}x^2)`, rule: "כלל השרשרת: (sin u)' = cos(u)·u'" };
    default:
      return { kind: "deriv", f: `e^(${cx(a, "x", true)})cos(x)`, answer: `${a}e^(${a}x)cos(x) - e^(${a}x)sin(x)`, rule: "מכפלה + שרשרת" };
  }
}

/** "+ -3" → "- 3", "1x" kept simple: for showing an answer, not for parsing. */
export const pretty = (s: string) => s.replace(/\+ -/g, "- ").replace(/- -/g, "+ ").replace(/\(\+?(-?\d+)\)/g, "$1");

export function checkDeriv(d: DerivDrill, typed: string) {
  return sameFunction(typed, d.answer);
}

// ---------- limits of sequences ----------

export type Limit = { inf: 1 | -1 } | { value: Frac };

export interface LimitDrill {
  kind: "limit";
  /** shown to the user, in n */
  expr: string;
  answer: Limit;
  why: string;
}

/** "3n^2 - n + 4" from coefficients [c0, c1, …] (index = power). */
export function polyText(cs: number[], v = "n"): string {
  let s = "";
  for (let p = cs.length - 1; p >= 0; p--) {
    const c = cs[p];
    if (!c) continue;
    const body = p === 0 ? "" : p === 1 ? v : `${v}^${p}`;
    s += `${sgn(c, !s)}${Math.abs(c) === 1 && body ? "" : Math.abs(c)}${body}`;
  }
  return s || "0";
}

/** The limit of P(n)/Q(n) as n → ∞, exactly. */
export function rationalLimit(P: number[], Q: number[]): Limit {
  const deg = (cs: number[]) => {
    for (let i = cs.length - 1; i >= 0; i--) if (cs[i]) return i;
    return -1;
  };
  const dp = deg(P);
  const dq = deg(Q);
  if (dq < 0) throw new Error("zero denominator");
  if (dp < dq) return { value: Frac.zero };
  const ratio = F(P[dp], Q[dq]);
  if (dp === dq) return { value: ratio };
  return { inf: ratio.sign() > 0 ? 1 : -1 };
}

export function genLimitDrill(seed: number): LimitDrill {
  const r = rng(seed);
  const kind = r.int(0, 5);
  if (kind === 5) {
    const a = r.pick([2, 4, 6, -2, 3]);
    return { kind: "limit", expr: `sqrt(n^2 ${a < 0 ? "-" : "+"} ${Math.abs(a)}n) - n`, answer: { value: F(a, 2) }, why: "כפל בצמוד: an/(√(n²+an)+n) → a/2" };
  }
  const dq = r.int(1, 3);
  const dp = kind <= 2 ? dq : kind === 3 ? dq - 1 : Math.min(3, dq + 1);
  const coeffs = (d: number) => Array.from({ length: d + 1 }, (_, i) => (i === d ? r.pick([1, 2, 3, 4, 5, -1, -2, -3]) : r.int(-5, 6)));
  const P = dp < 0 ? [r.int(1, 7)] : coeffs(dp);
  const Q = coeffs(dq);
  const answer = rationalLimit(P, Q);
  const why = dp === dq ? "אותה חזקה עליונה: היחס בין המקדמים המובילים" : dp < dq ? "החזקה במכנה גבוהה יותר → 0" : "החזקה במונה גבוהה יותר → אינסוף, הסימן לפי המקדמים המובילים";
  return { kind: "limit", expr: `(${polyText(P)}) / (${polyText(Q)})`, answer, why };
}

/** Reads "3/4", "-2", "∞", "inf", "-∞", or an expression like e^2 / sqrt(2). */
export function checkLimit(answer: Limit, typed: string): { ok: boolean; error?: string } {
  const s = typed.trim().replace(/[−–]/g, "-").toLowerCase();
  if (!s) return { ok: false, error: "כתבו תשובה" };
  const inf = s.match(/^([+-]?)\s*(∞|inf|infinity|אינסוף)$/);
  if (inf) return { ok: "inf" in answer && answer.inf === (inf[1] === "-" ? -1 : 1) };
  if ("inf" in answer) return { ok: false };
  const f = Frac.parse(s);
  if (f) return { ok: f.eq(answer.value) };
  try {
    const v = evalExpr(parseExpr(s), 0);
    return { ok: Number.isFinite(v) && close(v, answer.value.toNumber()) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export const limitText = (l: Limit) => ("inf" in l ? (l.inf > 0 ? "∞" : "−∞") : l.value.toString());
