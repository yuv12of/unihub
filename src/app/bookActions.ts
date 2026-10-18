"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseEnabled } from "@/lib/supabase/config";
import { searchBooks as search, type SearchHit } from "@/lib/books";
import type { Failed } from "@/app/actions";

async function g<T>(fn: () => Promise<T>): Promise<T | Failed> {
  try {
    return await fn();
  } catch (e) {
    return { failed: e instanceof Error && e.message ? e.message : "שגיאה" };
  }
}

async function db() {
  if (!supabaseEnabled) throw new Error("לא מחובר");
  return createClient();
}

/** Remembers where I stopped reading (page within the chapter). Quiet: no refresh. */
export async function savePlace(chapterId: string, page: number) {
  return g(async () => {
    const sb = await db();
    const p = Math.max(1, Math.min(5000, Math.round(page)));
    await sb.from("book_chapters").update({ last_page: p, read_at: new Date().toISOString() }).eq("id", chapterId);
    return true;
  });
}

export async function markChapterDone(chapterId: string, done: boolean) {
  return g(async () => {
    const sb = await db();
    const { error } = await sb.from("book_chapters").update({ done_at: done ? new Date().toISOString() : null }).eq("id", chapterId);
    if (error) throw new Error("לא נשמר");
    return done;
  });
}

export async function setQuestionStatus(id: string, status: "solved" | "stuck" | "skipped" | null) {
  return g(async () => {
    const sb = await db();
    const { error } = await sb.from("book_questions").update({ status }).eq("id", id);
    if (error) throw new Error("לא נשמר");
    return status;
  });
}

export async function searchMyBooks(q: string, course?: string): Promise<SearchHit[] | Failed> {
  return g(() => search(String(q).slice(0, 100), course));
}
