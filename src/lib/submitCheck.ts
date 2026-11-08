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
 * numbers, saved this semester (`notBefore`: an ISO date). Several (copies): the most recently
 * modified.
 */
export function findSolutionNote<N extends NoteRow>(notes: N[], code: string, numbers: number[], notBefore?: string): N | null {
  const hits = notes.filter((x) => {
    if (x.course_code !== code) return false;
    // a previous semester's solution to "ממ״ן 12" is not this semester's
    if (notBefore && (x.modified_at ?? "") < notBefore) return false;
    const name = x.name.normalize("NFC").replace(/\.pdf$/i, "");
    if (!ASSIGNMENT_WORD.test(name) && !ASSIGNMENT_WORD.test(x.folder ?? "")) return false;
    const nums = [...name.matchAll(/(?<!\d)(\d{1,2})(?!\d)/g)].map((m) => Number(m[1]));
    return nums.some((v) => numbers.includes(v));
  });
  return hits.sort((a, b) => (b.modified_at ?? "").localeCompare(a.modified_at ?? ""))[0] ?? null;
}

/** An ID number (9 digits) near the top of the recognised text. Digits survive OCR well. */
export const hasIdNumber = (text: string | null | undefined) => /(?<!\d)\d{9}(?!\d)/.test((text ?? "").slice(0, 600));

export interface NoteHeadings {
  /** headings found with writing under them: "1", "1א", "3ב(1)" */
  keys: string[];
  /** headings found with nothing written under them */
  empty: string[];
  pages: number | null;
}

const HEB = /^[א-מ]$/;
const FINAL: Record<string, string> = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };

/**
 * The model's reply ({parts:[{q, part, sub, page, has_answer}], pages}) as part keys. Anything
 * malformed is dropped: a wrong key would tick a part that was never answered.
 */
export function normalizeHeadings(raw: unknown): NoteHeadings {
  const r = (raw && typeof raw === "object" ? raw : {}) as { parts?: unknown; pages?: unknown };
  const keys = new Set<string>();
  const empty = new Set<string>();
  for (const p of Array.isArray(r.parts) ? r.parts.slice(0, 200) : []) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const q = Number(o.q);
    if (!Number.isInteger(q) || q < 1 || q > 20) continue;
    let key = String(q);
    const partRaw = typeof o.part === "string" ? o.part.replace(/["'׳״.\s()]/g, "") : "";
    const part = FINAL[partRaw] ?? partRaw;
    if (part) {
      if (!HEB.test(part)) continue;
      key += part;
      const sub = o.sub == null || o.sub === "" ? null : Number(String(o.sub).replace(/[()\s]/g, ""));
      if (sub != null) {
        if (!Number.isInteger(sub) || sub < 1 || sub > 9) continue;
        key += `(${sub})`;
      }
    }
    if (o.has_answer === false) empty.add(key);
    else keys.add(key);
  }
  for (const k of keys) empty.delete(k);
  const pages = Number(r.pages);
  return { keys: [...keys], empty: [...empty], pages: Number.isInteger(pages) && pages > 0 ? pages : null };
}

/**
 * Whether the solution answers the sheet's part `key` ("3ב(1)", "3א", "2"): its own heading, or a
 * heading it sits under (a solution that labels ב but not ב(1), ב(2) answers both inside it), or
 * for a question without parts, any heading of that question.
 */
export function detectedIn(found: Set<string>, key: string): boolean {
  if (found.has(key)) return true;
  const m = key.match(/^(\d+)([א-מ])?(\(\d\))?$/);
  if (!m) return false;
  const [, q, part, sub] = m;
  if (part && sub && found.has(q + part)) return true;
  if (!part) return [...found].some((k) => k.startsWith(q) && !/^\d/.test(k.slice(q.length)));
  return false;
}
