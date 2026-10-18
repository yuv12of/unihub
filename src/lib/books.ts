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
  last_page: number | null;
  read_at: string | null;
  done_at: string | null;
  has_text: boolean;
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

const CHAPTER_COLS = "id, book_id, idx, title, start_page, end_page, storage_path, summary, key_points, last_page, read_at, done_at, has_text:text_content";

type ChapterRow = Omit<Chapter, "has_text"> & { has_text: string | null };
const toChapter = (r: ChapterRow): Chapter => ({ ...r, has_text: !!r.has_text });

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
    .select("id, book_id, idx, title, start_page, end_page, storage_path, summary, key_points, last_page, read_at, done_at")
    .in("book_id", books.map((b) => b.id))
    .order("idx");
  return books.map((b) => ({
    ...b,
    chapters: (chapters ?? []).filter((c) => c.book_id === b.id).map((c) => ({ ...c, has_text: true }) as Chapter),
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
