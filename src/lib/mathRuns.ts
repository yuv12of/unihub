/**
 * Splits Hebrew text with plain-text math in it into runs, so each math run can be isolated
 * left-to-right (<bdi dir="ltr">) and keep its order inside a right-to-left paragraph.
 *
 * Rules:
 * - A word with no Hebrew letters that contains anything other than punctuation is LTR content:
 *   formulas, symbols (ℝ ⇒ ∑ ⌊x⌋ x² Θ(n lg n)), English terms (HEAPSORT, dim U), numbers.
 * - A Hebrew prefix glued to math with a maqaf or hyphen ("ש־ℚ", "ב־1+x", "ל-x") is split off.
 * - Punctuation-only words ("−", "=", ",") join a math run when math is on both sides.
 * - Sentence punctuation at the end of a run, and brackets that open or close outside the run
 *   ("(למשל x > 0)"), stay outside the isolate so the paragraph mirrors them correctly.
 */

export type Run = { math: boolean; text: string };

const HEB = /[֐-׿יִ-ﭏ]/;
/** punctuation that is neutral on its own */
const NEUTRAL = /^[\s.,;:!?"'׳״־–—\-−=+*/<>≤≥≠≈|()[\]{}…]*$/;
const SENTENCE_END = /[.,;:!?…]+$/;

function isMathWord(w: string) {
  return !HEB.test(w) && !NEUTRAL.test(w);
}

/** "ש־ℚ" → ["ש־", "ℚ"]; "ב-x" → ["ב-", "x"]; otherwise [w]. */
function splitPrefix(w: string): string[] {
  const m = w.match(/^([֐-׿]{1,4}[־-])(.+)$/);
  if (m && !HEB.test(m[2])) return [m[1], m[2]];
  return [w];
}

const count = (s: string, c: string) => s.split(c).length - 1;

/** Move unbalanced brackets at the edges of a math run out of it. */
function trimBrackets(s: string): { pre: string; core: string; post: string } {
  let pre = "";
  let post = "";
  let core = s;
  const pairs: [string, string][] = [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ];
  let changed = true;
  while (changed && core) {
    changed = false;
    const end = core.match(SENTENCE_END);
    if (end) {
      post = end[0] + post;
      core = core.slice(0, -end[0].length);
      changed = true;
    }
    for (const [o, c] of pairs) {
      if (core.endsWith(c) && count(core, c) > count(core, o)) {
        post = c + post;
        core = core.slice(0, -1);
        changed = true;
      }
      if (core.startsWith(o) && count(core, o) > count(core, c)) {
        pre += o;
        core = core.slice(1);
        changed = true;
      }
    }
  }
  return { pre, core, post };
}

export function mathRuns(text: string): Run[] {
  // words and the whitespace between them
  const parts = text.split(/(\s+)/).flatMap((p) => (/^\s+$/.test(p) || !p ? [p] : splitPrefix(p)));
  type Tok = { s: string; kind: "space" | "math" | "neutral" | "text" };
  const toks: Tok[] = parts
    .filter((p) => p !== "")
    .map((s) => ({ s, kind: /^\s+$/.test(s) ? "space" : isMathWord(s) ? "math" : NEUTRAL.test(s) ? "neutral" : "text" }));

  // a neutral word is math when the nearest words on both sides are math
  const word = (i: number, step: number) => {
    for (let j = i + step; j >= 0 && j < toks.length; j += step) if (toks[j].kind !== "space") return toks[j];
    return null;
  };
  for (let i = 0; i < toks.length; i++)
    if (toks[i].kind === "neutral") {
      const a = word(i, -1);
      const b = word(i, 1);
      if (a?.kind === "math" && (b?.kind === "math" || b?.kind === "neutral")) toks[i].kind = "math";
    }
  // a neutral that became math may make the next neutral math too (a − − b), one more pass is enough
  for (let i = 0; i < toks.length; i++)
    if (toks[i].kind === "neutral") {
      const a = word(i, -1);
      const b = word(i, 1);
      if (a?.kind === "math" && b?.kind === "math") toks[i].kind = "math";
    }

  // group: math words and the spaces between them form one run
  const runs: Run[] = [];
  let i = 0;
  while (i < toks.length) {
    if (toks[i].kind === "math") {
      let j = i;
      let s = "";
      let lastMath = i;
      while (j < toks.length && (toks[j].kind === "math" || toks[j].kind === "space")) {
        if (toks[j].kind === "math") lastMath = j;
        j++;
      }
      for (let k = i; k <= lastMath; k++) s += toks[k].s;
      const { pre, core, post } = trimBrackets(s);
      if (pre) push(runs, false, pre);
      if (core) push(runs, true, core);
      if (post) push(runs, false, post);
      i = lastMath + 1;
    } else {
      push(runs, false, toks[i].s);
      i++;
    }
  }
  return runs;
}

function push(runs: Run[], math: boolean, text: string) {
  const last = runs[runs.length - 1];
  if (last && last.math === math && !math) last.text += text;
  else runs.push({ math, text });
}
