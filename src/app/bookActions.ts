"use server";

import { refresh } from "next/cache";
import { action, must } from "@/app/guard";
import { chapterUrl, getBooks, readingByCourse, searchBooks as search, type SearchHit } from "@/lib/books";
import type { Failed } from "@/app/guard";

export interface FocusBook {
  bookId: string;
  bookTitle: string;
  chapterId: string;
  idx: number;
  title: string;
  /** signed PDF link of the chapter (1 hour) */
  url: string;
  pages: number;
  /** where to open: the saved place, or 1 */
  page: number;
  /** the book's chapters, to move on without leaving the timer */
  chapters: { idx: number; title: string; done: boolean }[];
}

/**
 * The chapter to read inside the focus timer: the one the session's plan points at (bookId + idx
 * from its reading step), else the chapter to continue in this course, opened at the saved page.
 */
export async function getFocusBook(input: { courseCode: string | null; bookId?: string | null; idx?: number | null }): Promise<FocusBook | null | Failed> {
  return action("getFocusBook", async () => {
    const code = input.courseCode && /^\d{5}$/.test(input.courseCode) ? input.courseCode : null;
    const books = await getBooks(code ?? undefined);
    let bookId = input.bookId && /^[0-9a-f-]{36}$/.test(input.bookId) ? input.bookId : null;
    let idx = Number.isInteger(input.idx) ? Number(input.idx) : null;
    if (!bookId || idx == null) {
      const r = code ? readingByCourse(books)[code] : null;
      if (!r) return null;
      bookId = r.bookId;
      idx = r.idx;
    }
    const book = books.find((b) => b.id === bookId);
    const ch = book?.chapters.find((c) => c.idx === idx);
    if (!book || !ch) return null;
    const url = await chapterUrl(ch.storage_path);
    if (!url) return null;
    const pages = ch.end_page - ch.start_page + 1;
    return {
      bookId: book.id,
      bookTitle: book.title,
      chapterId: ch.id,
      idx: ch.idx,
      title: ch.title,
      url,
      pages,
      page: ch.last_page && !ch.done_at ? Math.min(ch.last_page, pages) : 1,
      chapters: book.chapters.map((c) => ({ idx: c.idx, title: c.title, done: !!c.done_at })),
    };
  });
}


/** Remembers where I stopped reading (page within the chapter). Quiet: no refresh. */
export async function savePlace(chapterId: string, page: number) {
  return action("savePlace", async ({ supabase: sb }) => {
    const p = Math.max(1, Math.min(5000, Math.round(page)));
    must(await sb.from("book_chapters").update({ last_page: p, read_at: new Date().toISOString() }).eq("id", chapterId));
    return true;
  });
}

export async function markChapterDone(chapterId: string, done: boolean) {
  return action("markChapterDone", async ({ supabase: sb }) => {
    const { error } = await sb.from("book_chapters").update({ done_at: done ? new Date().toISOString() : null }).eq("id", chapterId);
    if (error) throw new Error("לא נשמר");
    return done;
  });
}

export async function setQuestionStatus(id: string, status: "solved" | "stuck" | "skipped" | null) {
  return action("setQuestionStatus", async ({ supabase: sb }) => {
    const { error } = await sb.from("book_questions").update({ status }).eq("id", id);
    if (error) throw new Error("לא נשמר");
    return status;
  });
}

export async function searchMyBooks(q: string, course?: string): Promise<SearchHit[] | Failed> {
  return action("searchMyBooks", () => search(String(q).slice(0, 100), course));
}

/** Removes one of my books: its chapter files from storage, then the records (questions and cards go with it). */
export async function deleteBook(bookId: string) {
  return action("deleteBook", async ({ supabase: sb }) => {
    const { data: chapters } = await sb.from("book_chapters").select("id, storage_path").eq("book_id", bookId);
    const paths = (chapters ?? []).map((c) => c.storage_path).filter(Boolean);
    if (paths.length) await sb.storage.from("books").remove(paths);
    if (chapters?.length) await sb.from("cards").delete().in("chapter_id", chapters.map((c) => c.id));
    const { error } = await sb.from("books").delete().eq("id", bookId);
    if (error) throw new Error("לא נמחק");
    refresh();
    return true;
  });
}
