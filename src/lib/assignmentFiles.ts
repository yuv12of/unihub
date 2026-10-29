/**
 * Assignment files: the question sheet of each ממ"ן / ממ"ח, uploaded once a semester.
 * Pure, client-safe parts (matching a file to its assignment by name).
 */

export const ASSIGNMENT_FILE_MAX = 50 * 1024 * 1024;
/** n of a booklet that holds all the course's assignments */
export const BOOKLET = "all";

export interface AssignmentFile {
  id: string;
  n: string;
  name: string;
  size: number | null;
  lastPage: number | null;
}

const num = (s: string) => String(Number(s));

/**
 * "mmn11.pdf", "ממ״ן 12 - לינארית.pdf", "20474_maman_13_2027a.pdf" → that assignment's n;
 * "חוברת מטלות.pdf" → the booklet; null when the name doesn't say (the person picks).
 * `ns`: the course's assignment numbers as listed ("11", "12", or "01").
 */
export function guessAssignment(fileName: string, ns: string[]): string | null {
  const name = fileName
    .normalize("NFC")
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/, "")
    .replace(/["'״׳`]/g, "");
  const byNumber = (d: string) => ns.find((n) => num(n) === num(d)) ?? null;

  // a named assignment: ממן 11, mmn_11, maman-11, ממח 2, matala 3
  const named = name.match(/(?:ממן|ממח|מטלה|mmn|mmh|maman|mamn|mmach|mamah|matala|assignment)\s*[-_ ]?\s*(\d{1,3})(?!\d)/);
  if (named) return byNumber(named[1]);

  if (/(חוברת|booklet|matalot|מטלות)/.test(name)) return BOOKLET;

  // otherwise one short number that is one of the course's assignments (not the course code or a year)
  const shorts = [...name.matchAll(/(?<!\d)(\d{1,2})(?!\d)/g)].map((m) => m[1]);
  const hits = [...new Set(shorts.map(byNumber).filter((x): x is string => !!x))];
  return hits.length === 1 ? hits[0] : null;
}

/** The file to open for assignment n: its own sheet, else the booklet. */
export function sheetFor<F extends { n: string }>(files: F[], n: string): F | null {
  return files.find((f) => f.n === n) ?? files.find((f) => f.n === BOOKLET) ?? null;
}
