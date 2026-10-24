/**
 * Reads what the practice page, the pretest and the tutor questions need. Every read treats a
 * missing table (0020 not applied yet) or an error as empty.
 */
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { todayInIsrael } from "@/lib/semester";
import type { Card } from "@/lib/userdata";
import { nextPhoneSlot, PHONE_PREFIX, type PhoneSlot, type PracticeChapter, type PracticeQuestion } from "@/lib/practice";

export interface PracticeData {
  cards: Card[];
  questions: PracticeQuestion[];
  chapters: PracticeChapter[];
  /** question ids answered today (in /study, the mix, or a pretest) */
  answeredToday: string[];
}

const CARD_COLS = "id, course_code, topic, kind, front, back, options, answer_index, explanation, due_at, reps";

export async function getPracticeData(): Promise<PracticeData> {
  if (!supabaseEnabled) return { cards: [], questions: [], chapters: [], answeredToday: [] };
  const sb = await createClient();
  const since = new Date(Date.now() - 36 * 3_600_000).toISOString();
  const [cards, books, chapters, questions, attempts] = await Promise.all([
    sb.from("cards").select(CARD_COLS).lte("due_at", new Date().toISOString()).order("due_at").limit(200),
    sb.from("books").select("id, course_code"),
    sb.from("book_chapters").select("id, book_id, idx, title, read_at, done_at"),
    sb.from("book_questions").select("id, chapter_id, idx, prompt, hint, answer, page, difficulty, status").order("idx"),
    sb.from("practice_attempts").select("question_id, created_at").not("question_id", "is", null).gte("created_at", since),
  ]);
  const course = new Map((books.data ?? []).map((b) => [b.id as string, b.course_code as string]));
  const chs = new Map(
    (chapters.data ?? []).map((c) => [c.id as string, { ...c, course_code: course.get(c.book_id) ?? "" }]),
  );
  const today = todayInIsrael();
  return {
    cards: (cards.data ?? []) as Card[],
    questions: (questions.data ?? []).flatMap((q) => {
      const c = chs.get(q.chapter_id);
      if (!c) return [];
      return [{ ...q, course_code: c.course_code, chapter_title: c.title, chapter_idx: c.idx, book_id: c.book_id } as PracticeQuestion];
    }),
    chapters: [...chs.values()].map((c) => ({ id: c.id, title: c.title, course_code: c.course_code, opened: !!(c.read_at || c.done_at) })),
    answeredToday: attempts.error
      ? []
      : [...new Set((attempts.data ?? []).filter((a) => todayInIsrael(new Date(a.created_at)) === today).map((a) => a.question_id as string))],
  };
}

/** HH:MM now in Israel. */
export function nowInIsrael(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

/** The next phone-tutoring hour of a course (or of any course with null). */
export async function getNextPhoneSlot(courseCode: string | null): Promise<PhoneSlot | null> {
  if (!supabaseEnabled) return null;
  const sb = await createClient();
  const today = todayInIsrael();
  let q = sb
    .from("user_events")
    .select("date, start_time, end_time, title, location, course_code, cancelled")
    .like("title", `${PHONE_PREFIX}%`)
    .gte("date", today)
    .order("date")
    .limit(20);
  if (courseCode) q = q.eq("course_code", courseCode);
  const { data } = await q;
  return nextPhoneSlot(data ?? [], courseCode, today, nowInIsrael());
}

/** The next tutorial meetup of a course. */
export async function getNextTutorial(courseCode: string): Promise<{ date: string; start_time: string | null; end_time: string | null; title: string; location: string | null } | null> {
  if (!supabaseEnabled) return null;
  const sb = await createClient();
  const { data } = await sb
    .from("user_events")
    .select("date, start_time, end_time, title, location")
    .eq("kind", "tutorial")
    .eq("course_code", courseCode)
    .eq("cancelled", false)
    .gte("date", todayInIsrael())
    .order("date")
    .order("start_time")
    .limit(1);
  return data?.[0] ?? null;
}

export interface StuckQuestion {
  stuck_id: string;
  tried: string;
  where_stuck: string;
  book_href: string | null;
  asked_via: "phone" | "forum" | "mail" | "meetup" | null;
}

export async function getStuckQuestions(ids?: string[]): Promise<Record<string, StuckQuestion>> {
  if (!supabaseEnabled) return {};
  const sb = await createClient();
  let q = sb.from("stuck_questions").select("stuck_id, tried, where_stuck, book_href, asked_via");
  if (ids) q = q.in("stuck_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const { data, error } = await q;
  if (error) return {};
  return Object.fromEntries((data ?? []).map((r) => [r.stuck_id, r as StuckQuestion]));
}
