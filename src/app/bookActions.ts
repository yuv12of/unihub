"use server";

import { refresh } from "next/cache";
import { action, must } from "@/app/guard";
import { searchBooks as search, type SearchHit } from "@/lib/books";
import type { Failed } from "@/app/guard";



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
