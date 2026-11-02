/**
 * "Ready to submit": the pure parts. Finds my solution among the synced Notability notes and
 * checks what can be checked without reading the answers: that a solution exists, that it is the
 * latest version, that an ID number heads it. The handwriting itself is never judged (Drive's OCR
 * of Hebrew handwriting is too noisy to even find the question headings reliably).
 */
import type { Assignment } from "@/lib/semester";

/**
 * The numbers a solution note for assignment n may carry: n itself ("מטלה 01") and its ממ"ן number
 * (the k-th file assignment of the course is ממ"ן 1k: Infi's 01, 03, 04 are ממ"ן 11, 12, 13).
 */
export function solutionNumbers(assignments: Pick<Assignment, "n" | "type">[], n: string): number[] {
  const out = new Set<number>([Number(n)]);
  const files = assignments.filter((a) => a.type === "file");
  const k = files.findIndex((a) => a.n === n);
  if (k >= 0) out.add(10 + k + 1);
  return [...out].filter((x) => Number.isFinite(x));
}

export interface NoteRow {
  id: string;
  name: string;
  folder: string | null;
  course_code: string | null;
  url: string | null;
  modified_at: string | null;
}

const ASSIGNMENT_WORD = /(ממ["״']?[ןנ]|ממן|מטל|mmn|maman|matala|assignment)/i;

/**
 * The note that is my solution: in the course, named or filed as an assignment, with one of its
 * numbers. Several (copies, old semesters): the most recently modified.
 */
export function findSolutionNote<N extends NoteRow>(notes: N[], code: string, numbers: number[]): N | null {
  const hits = notes.filter((x) => {
    if (x.course_code !== code) return false;
    const name = x.name.normalize("NFC").replace(/\.pdf$/i, "");
    if (!ASSIGNMENT_WORD.test(name) && !ASSIGNMENT_WORD.test(x.folder ?? "")) return false;
    const nums = [...name.matchAll(/(?<!\d)(\d{1,2})(?!\d)/g)].map((m) => Number(m[1]));
    return nums.some((v) => numbers.includes(v));
  });
  return hits.sort((a, b) => (b.modified_at ?? "").localeCompare(a.modified_at ?? ""))[0] ?? null;
}

/** An ID number (9 digits) near the top of the recognised text. Digits survive OCR well. */
export const hasIdNumber = (text: string | null | undefined) => /(?<!\d)\d{9}(?!\d)/.test((text ?? "").slice(0, 600));
