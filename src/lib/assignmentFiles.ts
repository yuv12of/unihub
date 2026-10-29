/**
 * Assignment files: the question sheet of each file assignment (ממ"ן), uploaded once a semester,
 * the link of each online one (ממ"ח), and the file I submitted. Pure, client-safe parts.
 */

export const ASSIGNMENT_FILE_MAX = 50 * 1024 * 1024;
/** n of a booklet that holds all the course's assignments */
export const BOOKLET = "all";

export type AssignmentFileKind = "sheet" | "answer";

export interface AssignmentFile {
  id: string;
  n: string;
  /** sheet: the questions (or the online assignment's link); answer: what I submitted */
  kind: AssignmentFileKind;
  name: string;
  size: number | null;
  lastPage: number | null;
  /** a link instead of a stored file (an online assignment) */
  url: string | null;
  /** a stored PDF (opens in the reader); other stored files (a zip, a Word file) download */
  pdf: boolean;
  /** a download link for a stored file that isn't a PDF */
  href?: string | null;
}

/** What can go with an assignment: the PDF sheet, and extra files the course gives (zip, Word, images). */
export const SHEET_ACCEPT = ".pdf,.zip,.doc,.docx,.txt,.java,.py,.c,.png,.jpg,.jpeg,application/pdf,application/zip,image/*";

/** Submitted files: PDF opens in the reader; Word and images download. */
export const ANSWER_ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.heic,application/pdf,image/*";
export const isPdf = (name: string) => /\.pdf$/i.test(name);

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

type Row = { n: string; kind?: AssignmentFileKind; url?: string | null; pdf?: boolean };
const isSheet = (f: Row) => (f.kind ?? "sheet") === "sheet" && !f.url && f.pdf !== false;

/** The stored sheet to open for assignment n: its own, else the booklet. */
export function sheetFor<F extends Row>(files: F[], n: string): F | null {
  return files.find((f) => f.n === n && isSheet(f)) ?? files.find((f) => f.n === BOOKLET && isSheet(f)) ?? null;
}

/** Extra stored files of assignment n that aren't the PDF sheet (a zip of starter files). */
export function extrasFor<F extends Row>(files: F[], n: string): F[] {
  return files.filter((f) => f.n === n && (f.kind ?? "sheet") === "sheet" && !f.url && f.pdf === false);
}

/** An online assignment's link. */
export function linkFor<F extends Row>(files: F[], n: string): F | null {
  return files.find((f) => f.n === n && (f.kind ?? "sheet") === "sheet" && !!f.url) ?? null;
}

/** The file I submitted for assignment n (the latest). */
export function answerFor<F extends Row>(files: F[], n: string): F | null {
  return [...files].reverse().find((f) => f.n === n && f.kind === "answer") ?? null;
}
