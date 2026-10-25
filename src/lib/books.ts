import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface Chapter {
  id: string;
  book_id: string;
  idx: number;
  title: string;
  start_page: number;
  end_page: number;
  storage_path: string;
  summary: string | null;
  key_points: string[] | null;
  /** "סיכום הפרק", written by the morning task (null until then) */
  conclusion: ChapterConclusion | null;
  last_page: number | null;
  read_at: string | null;
  done_at: string | null;
  has_text: boolean;
}

export interface ChapterConclusion {
  /** the chapter in one sentence */
  bottom_line: string;
  /** definitions, theorems and methods to know, with the page inside the chapter */
  must_know: { kind: "def" | "thm" | "method"; title: string; text: string; page?: number | null }[];
  /** common mistakes */
  pitfalls: string[];
  /** quick questions to check yourself */
  self_check: { q: string; a: string }[];
  /** how it leads into the next chapter */
  next?: string | null;
}

/** Tolerant read of the jsonb (written by a scheduled task). */
export function readConclusion(v: unknown): ChapterConclusion | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const arr = (x: unknown) => (Array.isArray(x) ? x : []);
  const bottom = str(o.bottom_line);
  const must = arr(o.must_know)
    .map((m) => m as Record<string, unknown>)
    .map((m) => ({
      kind: (["def", "thm", "method"].includes(String(m.kind)) ? m.kind : "thm") as "def" | "thm" | "method",
      title: str(m.title),
      text: str(m.text),
      page: Number.isFinite(Number(m.page)) && Number(m.page) > 0 ? Number(m.page) : null,
    }))
    .filter((m) => m.title || m.text);
  if (!bottom && !must.length) return null;
  return {
    bottom_line: bottom,
    must_know: must,
    pitfalls: arr(o.pitfalls).map(str).filter(Boolean),
    self_check: arr(o.self_check)
      .map((x) => x as Record<string, unknown>)
      .map((x) => ({ q: str(x.q), a: str(x.a) }))
      .filter((x) => x.q && x.a),
    next: str(o.next) || null,
  };
}

export interface Book {
  id: string;
  course_code: string;
  title: string;
  pages: number;
  position: number;
  chapters: Chapter[];
}

export interface BookQuestion {
  id: string;
  chapter_id: string;
  idx: number;
  prompt: string;
  hint: string | null;
  answer: string;
  page: number | null;
  difficulty: number;
  status: "solved" | "stuck" | "skipped" | null;
}

const CHAPTER_COLS = "id, book_id, idx, title, start_page, end_page, storage_path, summary, key_points, conclusion, last_page, read_at, done_at, has_text:text_content";

type ChapterRow = Omit<Chapter, "has_text"> & { has_text: string | null };
const toChapter = (r: ChapterRow): Chapter => ({ ...r, conclusion: readConclusion(r.conclusion), has_text: !!r.has_text });

/** My books (all courses, or one), chapters in order. Never other users' books (RLS). */
export async function getBooks(course?: string): Promise<Book[]> {
  if (!supabaseEnabled) return [];
  const sb = await createClient();
  let q = sb.from("books").select("id, course_code, title, pages, position").order("course_code").order("position").order("title");
  if (course) q = q.eq("course_code", course);
  const { data: books } = await q;
  if (!books?.length) return [];
  // has_text: only whether text exists. Selecting a short slice keeps the payload small.
  const { data: chapters } = await sb
    .from("book_chapters")
    .select("id, book_id, idx, title, start_page, end_page, storage_path, summary, key_points, conclusion, last_page, read_at, done_at")
    .in("book_id", books.map((b) => b.id))
    .order("idx");
  return books.map((b) => ({
    ...b,
    chapters: (chapters ?? []).filter((c) => c.book_id === b.id).map((c) => ({ ...c, conclusion: readConclusion(c.conclusion), has_text: true }) as Chapter),
  }));
}

export async function getBook(id: string): Promise<Book | null> {
  if (!supabaseEnabled) return null;
  const sb = await createClient();
  const { data: b } = await sb.from("books").select("id, course_code, title, pages, position").eq("id", id).maybeSingle();
  if (!b) return null;
  const { data: chapters } = await sb.from("book_chapters").select(CHAPTER_COLS).eq("book_id", id).order("idx");
  return { ...b, chapters: ((chapters ?? []) as unknown as ChapterRow[]).map(toChapter) };
}

/** A signed link (1 hour) to one chapter's PDF in my private storage. */
export async function chapterUrl(path: string): Promise<string | null> {
  if (!supabaseEnabled) return null;
  const sb = await createClient();
  const { data } = await sb.storage.from("books").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function getQuestions(chapterId: string): Promise<BookQuestion[]> {
  if (!supabaseEnabled) return [];
  const sb = await createClient();
  const { data } = await sb
    .from("book_questions")
    .select("id, chapter_id, idx, prompt, hint, answer, page, difficulty, status")
    .eq("chapter_id", chapterId)
    .order("idx");
  return (data ?? []) as BookQuestion[];
}

export async function chapterCardCount(chapterId: string): Promise<number> {
  if (!supabaseEnabled) return 0;
  const sb = await createClient();
  const { count } = await sb.from("cards").select("id", { count: "exact", head: true }).eq("chapter_id", chapterId);
  return count ?? 0;
}

export interface SearchHit {
  book_id: string;
  book: string;
  chapter_idx: number;
  chapter: string;
  page: number; // page within the chapter, 1-based
  snippet: string;
}

/** Plain-text search over my books. Hebrew niqqud and punctuation differences are ignored loosely. */
export async function searchBooks(q: string, course?: string, limit = 30): Promise<SearchHit[]> {
  const term = q.trim();
  if (!supabaseEnabled || term.length < 2) return [];
  const sb = await createClient();
  let bq = sb.from("books").select("id, title, course_code");
  if (course) bq = bq.eq("course_code", course);
  const { data: books } = await bq;
  if (!books?.length) return [];
  const { data: rows } = await sb
    .from("book_chapters")
    .select("book_id, idx, title, text_content")
    .in("book_id", books.map((b) => b.id))
    .ilike("text_content", `%${term.replace(/[%_]/g, "")}%`)
    .limit(40);
  const hits: SearchHit[] = [];
  const needle = term.toLowerCase();
  for (const r of rows ?? []) {
    const pages = (r.text_content ?? "").split("\f");
    pages.forEach((p: string, i: number) => {
      const at = p.toLowerCase().indexOf(needle);
      if (at < 0 || hits.length >= limit) return;
      const start = Math.max(0, at - 60);
      hits.push({
        book_id: r.book_id,
        book: books.find((b) => b.id === r.book_id)?.title ?? "",
        chapter_idx: r.idx,
        chapter: r.title,
        page: i + 1,
        snippet: (start ? "…" : "") + p.slice(start, at + term.length + 80).replace(/\s+/g, " ").trim() + "…",
      });
    });
  }
  return hits;
}

/** The chapter to continue: last one opened and not finished, else the first unfinished one. */
export function continueChapter(books: Book[]): { book: Book; chapter: Chapter } | null {
  let best: { book: Book; chapter: Chapter } | null = null;
  for (const book of books)
    for (const chapter of book.chapters)
      if (chapter.read_at && !chapter.done_at && (!best || chapter.read_at > (best.chapter.read_at ?? ""))) best = { book, chapter };
  if (best) return best;
  for (const book of books) {
    const chapter = book.chapters.find((c) => !c.done_at && c.idx > 0) ?? book.chapters.find((c) => !c.done_at);
    if (chapter) return { book, chapter };
  }
  return null;
}

/** Book sections that aren't chapters to read: front matter, contents, indexes, solutions, summaries. */
const AUX = /(תוכן|מפתח|ביבליוגרפיה|בעלי זכויות|פתח דבר|הנחיות|מטרות היחידה|רמזים|פתרונות|תשובות|ההגדרות והמשפטים|סו ?ף[־-]?דבר|אחרית דבר|^סיכום|^הקדמה)/;

export interface Reading {
  bookId: string;
  idx: number;
  title: string;
  lastPage: number | null;
  pages: number;
  href: string;
}

/**
 * What to read next in each course: the chapter you're in the middle of (opened, not finished),
 * otherwise the first unfinished real chapter in book order.
 */
export function readingByCourse(books: Book[]): Record<string, Reading> {
  const out: Record<string, Reading> = {};
  const byCourse = new Map<string, Book[]>();
  for (const b of books) byCourse.set(b.course_code, [...(byCourse.get(b.course_code) ?? []), b]);
  for (const [code, list] of byCourse) {
    const ordered = [...list].sort((a, b) => a.position - b.position);
    const real = ordered.flatMap((b) =>
      b.chapters
        // real chapters only; an optional prep book counts once you've started it
        .filter((c) => c.idx > 0 && !AUX.test(c.title) && c.end_page - c.start_page >= 4 && (!/הכנה/.test(b.title) || c.read_at))
        .map((c) => ({ b, c })),
    );
    const open = real
      .filter(({ c }) => c.read_at && !c.done_at)
      .sort((x, y) => (y.c.read_at ?? "").localeCompare(x.c.read_at ?? ""))[0];
    const pick = open ?? real.find(({ c }) => !c.done_at);
    if (!pick) continue;
    const { b, c } = pick;
    out[code] = {
      bookId: b.id,
      idx: c.idx,
      title: c.title,
      lastPage: c.done_at ? null : c.last_page,
      pages: c.end_page - c.start_page + 1,
      href: `/books/${b.id}?ch=${c.idx}`,
    };
  }
  return out;
}
