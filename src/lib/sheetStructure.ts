/**
 * The structure of an assignment sheet, read from the PDF's own text: its questions, their points,
 * and their parts (א, ב, ג… and sub-parts (1), (2)). Used by the "ready to submit" check to list
 * every part that needs an answer. Never reads or judges an answer.
 *
 * The OU sheets come in a few typesettings (as pdf.js extracts them, letters sometimes lost):
 *   שאלה1)25קודות(          Infi: points in reversed parentheses, נ dropped or a private-use glyph
 *   שאלה1(15נקודות)         Linear Algebra
 *   שאלה1  / א. (3נקודות)…  Data Structures: points per part
 *   שאלה100נקודות           a sheet with one question of 100 points
 * Parts: "א.טקסט", "ב( .9נקודות)"; sub-parts: ")1(", "(1)", "1( .2נקודות)".
 */

export interface SheetPart {
  /** "א" */
  label: string;
  /** sub-parts: ["1", "2"] */
  subs: string[];
}

export interface SheetQuestion {
  q: number;
  points: number | null;
  parts: SheetPart[];
}

export interface SheetStructure {
  questions: SheetQuestion[];
}

const LETTERS = "אבגדהוזחטיכלמ";

/** "שאלה1)25קודות(" → {q:1, points:25}; null when the line isn't a question heading. */
function questionHeading(line: string, expected: number): { q: number; points: number | null } | null {
  const m = line.match(/^\s*שאלה\s*(\d{1,3})(?:\s*[()]?\s*(\d{1,3}(?:\.\d)?)\s*[נ\uE000-\uF8FF]?קודות)?/);
  if (!m) return null;
  // "שאלה100נקודות": the digits run straight into the word: the points of a single question
  if (!m[2] && /^\s*שאלה\s*\d{1,3}\s*[נ\uE000-\uF8FF]?קודות/.test(line)) return expected === 1 ? { q: 1, points: Number(m[1]) } : null;
  const q = Number(m[1]);
  // a question number comes in order; anything else is a reference ("שאלה 12 ביחידה 2")
  if (q !== expected) return null;
  return { q, points: m[2] ? Number(m[2]) : null };
}

/** "א.טקסט", "א. (3נקודות)", "ב( .9נקודות)", "ב." → "א"/"ב"; null otherwise. */
function partHeading(line: string): string | null {
  const m = line.match(/^\s*([א-מ])\s*(?:\.|\(\s*\.)/);
  return m ? m[1] : null;
}

/** ")1(", "(1)", "1( .2נקודות)" (and "ב.)1(..." inside a part line) → "1". */
function subHeading(line: string): string | null {
  const m = line.match(/^\s*[)(]\s*(\d)\s*[)(]/) ?? line.match(/^\s*(\d)\s*\(\s*\./);
  return m ? m[1] : null;
}

/** A sub-part that starts on the part's own line: "ב.)1(תהי…" */
function inlineSub(line: string): string | null {
  const m = line.match(/^\s*[א-מ]\s*\.\s*[)(]\s*(\d)\s*[)(]/);
  return m ? m[1] : null;
}

export function parseSheet(text: string): SheetStructure {
  const lines = text.replace(/\r/g, "").split(/\n|\f/);
  const questions: SheetQuestion[] = [];
  let cur: SheetQuestion | null = null;

  for (const line of lines) {
    const h = questionHeading(line, questions.length + 1);
    if (h) {
      cur = { q: h.q, points: h.points, parts: [] };
      questions.push(cur);
      continue;
    }
    if (!cur) continue;

    const p = partHeading(line);
    if (p && p === LETTERS[cur.parts.length]) {
      const part: SheetPart = { label: p, subs: [] };
      const s = inlineSub(line);
      if (s === "1") part.subs.push(s);
      cur.parts.push(part);
      continue;
    }

    const s = subHeading(line);
    const last = cur.parts.at(-1);
    if (s && last && Number(s) === last.subs.length + 1) last.subs.push(s);
  }

  // a single sub-part is no division at all
  for (const q of questions) for (const p of q.parts) if (p.subs.length === 1) p.subs = [];
  return { questions };
}

export interface PartItem {
  /** stored key: "1", "3א", "3ב(1)" */
  key: string;
  /** shown: "א", "ב(1)", or "שאלה 2" for a question without parts */
  label: string;
}

/** Every answerable unit of question q: its parts and sub-parts, or the question itself. */
export function partItems(q: SheetQuestion): PartItem[] {
  if (!q.parts.length) return [{ key: String(q.q), label: `שאלה ${q.q}` }];
  return q.parts.flatMap((p) =>
    p.subs.length ? p.subs.map((s) => ({ key: `${q.q}${p.label}(${s})`, label: `${p.label}(${s})` })) : [{ key: `${q.q}${p.label}`, label: p.label }],
  );
}

/** Stored check ids for parts: "part:3ב(1)". */
export const PART_PREFIX = "part:";
export const PART_KEY = /^part:\d{1,2}([א-מ](\(\d\))?)?$/;

/** A plausible structure: at least one question, numbered from 1 with no gap. */
export const isUsable = (s: SheetStructure | null | undefined): s is SheetStructure => !!s && s.questions.length > 0;
