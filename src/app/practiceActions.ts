"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnabled } from "@/lib/supabase/config";
import type { Failed } from "@/app/actions";
import { getNextPhoneSlot, getNextTutorial, getStuckQuestions, type StuckQuestion } from "@/lib/practiceData";
import { pretestPick, type PhoneSlot } from "@/lib/practice";
import type { BookQuestion } from "@/lib/books";

async function g<T>(fn: () => Promise<T>): Promise<T | Failed> {
  try {
    return await fn();
  } catch (e) {
    return { failed: e instanceof Error && e.message ? e.message : "שגיאה" };
  }
}

async function requireUser() {
  if (!supabaseEnabled) throw new Error("לא מחובר");
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) throw new Error("לא מחובר");
  const { data: profile } = await sb.from("profiles").select("status").maybeSingle();
  if (profile?.status !== "approved") throw new Error("החשבון עוד לא אושר");
  return { sb, userId };
}

const UUID = /^[0-9a-f-]{36}$/i;
const KINDS = ["question", "mix", "pretest", "check", "drill"] as const;
const DRILLS = ["heap", "build", "bst", "chain", "probe", "rref", "det", "deriv", "limit"];
const RESULTS = ["solved", "stuck", "skipped", "seen"];

export interface AttemptInput {
  kind: (typeof KINDS)[number];
  question_id?: string | null;
  chapter_id?: string | null;
  course_code?: string | null;
  drill?: string | null;
  result?: string | null;
  correct?: boolean | null;
  picked_ok?: boolean | null;
  detail?: Record<string, unknown> | null;
}

function clean(a: AttemptInput, userId: string) {
  if (!KINDS.includes(a.kind)) throw new Error("סוג לא מוכר");
  return {
    user_id: userId,
    kind: a.kind,
    question_id: a.question_id && UUID.test(a.question_id) ? a.question_id : null,
    chapter_id: a.chapter_id && UUID.test(a.chapter_id) ? a.chapter_id : null,
    course_code: a.course_code && /^\d{5}$/.test(a.course_code) ? a.course_code : null,
    drill: a.drill && DRILLS.includes(a.drill) ? a.drill : null,
    result: a.result && RESULTS.includes(a.result) ? a.result : null,
    correct: typeof a.correct === "boolean" ? a.correct : null,
    picked_ok: typeof a.picked_ok === "boolean" ? a.picked_ok : null,
    detail: a.detail && JSON.stringify(a.detail).length < 4000 ? a.detail : null,
  };
}

/** Logs a practice attempt. Quiet (no refresh); a missing table is not an error for the user. */
export async function recordAttempt(a: AttemptInput) {
  return g(async () => {
    const { sb, userId } = await requireUser();
    const { error } = await sb.from("practice_attempts").insert(clean(a, userId));
    return !error;
  });
}

export interface PretestState {
  /** questions to try before reading (first open only) */
  pretest: BookQuestion[] | null;
  /** the same questions again once the chapter is done (until checked) */
  check: BookQuestion[] | null;
}

/**
 * Pretest for a chapter: on the first open (never read, no question marked, no pretest yet) two
 * of its questions; once a pretest was seen and not checked yet, the same ones for the check.
 */
export async function getPretest(chapterId: string) {
  return g(async (): Promise<PretestState> => {
    const { sb } = await requireUser();
    if (!UUID.test(chapterId)) return { pretest: null, check: null };
    const [{ data: ch }, { data: qs }, att] = await Promise.all([
      sb.from("book_chapters").select("read_at, done_at").eq("id", chapterId).maybeSingle(),
      sb.from("book_questions").select("id, chapter_id, idx, prompt, hint, answer, page, difficulty, status").eq("chapter_id", chapterId).order("idx"),
      sb.from("practice_attempts").select("kind, question_id").eq("chapter_id", chapterId).in("kind", ["pretest", "check"]),
    ]);
    const questions = (qs ?? []) as BookQuestion[];
    if (!ch || questions.length < 2) return { pretest: null, check: null };
    // without the table we can't remember the pretest: only offer it on a true first open
    if (att.error) {
      const first = !ch.read_at && !ch.done_at && questions.every((q) => !q.status);
      return { pretest: first ? pick(questions) : null, check: null };
    }
    const rows = att.data ?? [];
    const pretested = rows.filter((r) => r.kind === "pretest" && r.question_id).map((r) => r.question_id as string);
    const checked = rows.some((r) => r.kind === "check");
    if (!pretested.length) {
      const first = !ch.read_at && !ch.done_at && questions.every((q) => !q.status);
      return { pretest: first ? pick(questions) : null, check: null };
    }
    return { pretest: null, check: checked ? null : questions.filter((q) => pretested.includes(q.id)) };
  });
}

function pick(qs: BookQuestion[]) {
  const ids = pretestPick(qs);
  return ids.map((id) => qs.find((q) => q.id === id)!);
}

/** Remembers that the pretest (or the check) of these questions was done. */
export async function markPretest(chapterId: string, phase: "pretest" | "check", items: { id: string; result?: "solved" | "stuck" | "seen" }[]) {
  return g(async () => {
    const { sb, userId } = await requireUser();
    if (!UUID.test(chapterId)) throw new Error("פרק לא מוכר");
    const rows = items.slice(0, 5).map((it) => clean({ kind: phase, chapter_id: chapterId, question_id: it.id, result: it.result ?? "seen" }, userId));
    const { error } = await sb.from("practice_attempts").insert(rows);
    return !error;
  });
}

export interface AskContext {
  courseName: string | null;
  forumHref: string | null;
  question: StuckQuestion | null;
  phone: PhoneSlot | null;
  tutorial: Awaited<ReturnType<typeof getNextTutorial>>;
}

/** What the "turn into a question" sheet needs: a saved draft, the next phone hour and meetup. */
export async function getAskContext(stuckId: string, courseCode: string | null) {
  return g(async (): Promise<AskContext> => {
    const { sb } = await requireUser();
    const code = courseCode && /^\d{5}$/.test(courseCode) ? courseCode : null;
    const [course, qs, phone, tutorial] = await Promise.all([
      code ? sb.from("user_courses").select("short, course:courses(name, opal_id)").eq("course_code", code).limit(1).maybeSingle() : Promise.resolve({ data: null }),
      UUID.test(stuckId) ? getStuckQuestions([stuckId]) : Promise.resolve({} as Record<string, StuckQuestion>),
      getNextPhoneSlot(code),
      code ? getNextTutorial(code) : Promise.resolve(null),
    ]);
    const c = course.data as { short: string | null; course: { name: string; opal_id: number | null } | null } | null;
    return {
      courseName: c?.short || c?.course?.name || null,
      forumHref: c?.course?.opal_id ? `https://opal.openu.ac.il/mod/ouilforum/index.php?id=${c.course.opal_id}` : null,
      question: qs[stuckId] ?? null,
      phone,
      tutorial,
    };
  });
}

/** Saves the question text written for a stuck point (and where it was asked, if given). */
export async function saveStuckQuestion(input: { stuck_id: string; tried: string; where_stuck: string; asked_via?: "phone" | "forum" | "mail" | "meetup" | null }) {
  return g(async () => {
    const { sb, userId } = await requireUser();
    if (!UUID.test(input.stuck_id)) throw new Error("לא נמצא");
    const row: Record<string, unknown> = {
      stuck_id: input.stuck_id,
      user_id: userId,
      tried: String(input.tried ?? "").slice(0, 2000),
      where_stuck: String(input.where_stuck ?? "").slice(0, 2000),
      updated_at: new Date().toISOString(),
    };
    if (input.asked_via !== undefined) row.asked_via = input.asked_via && ["phone", "forum", "mail", "meetup"].includes(input.asked_via) ? input.asked_via : null;
    const { error } = await sb.from("stuck_questions").upsert(row);
    if (error) throw new Error("לא נשמר (צריך להפעיל את טבלת השאלות)");
    return true;
  });
}

/** Open stuck points per course into study prefs (same as actions.ts syncFocus), so plans weigh them. */
async function syncFocus(sb: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await sb.from("stuck_points").select("course_code").match({ user_id: userId, resolved: false });
  const focus: Record<string, number> = {};
  for (const r of data ?? []) if (r.course_code) focus[r.course_code] = (focus[r.course_code] ?? 0) + 1;
  await sb.from("study_prefs").update({ focus }).eq("user_id", userId);
}

/**
 * A book question I got stuck on becomes a stuck point (a question for the tutor), linked to its
 * page in the book. Returns the stuck point id; reuses an open one made from the same question.
 */
export async function stuckFromQuestion(questionId: string) {
  return g(async () => {
    const { sb, userId } = await requireUser();
    if (!UUID.test(questionId)) throw new Error("לא נמצא");
    const { data: q } = await sb.from("book_questions").select("id, prompt, page, chapter_id").eq("id", questionId).maybeSingle();
    if (!q) throw new Error("השאלה לא נמצאה");
    const { data: ch } = await sb.from("book_chapters").select("idx, title, book_id").eq("id", q.chapter_id).maybeSingle();
    const { data: book } = ch ? await sb.from("books").select("course_code").eq("id", ch.book_id).maybeSingle() : { data: null };
    const existing = await sb.from("stuck_questions").select("stuck_id").eq("question_id", questionId).limit(1);
    if (existing.data?.[0]) {
      await sb.from("stuck_points").update({ resolved: false }).match({ id: existing.data[0].stuck_id, user_id: userId });
      return existing.data[0].stuck_id as string;
    }
    const excerpt = String(q.prompt).replace(/\s+/g, " ").slice(0, 120);
    const topic = `${ch?.title ? `${ch.title}: ` : ""}${excerpt}`.slice(0, 300);
    const { data: sp, error } = await sb.from("stuck_points").insert({ user_id: userId, topic, course_code: book?.course_code ?? null }).select("id").single();
    if (error || !sp) throw new Error("לא נשמר");
    if (ch) {
      const href = `/books/${ch.book_id}?ch=${ch.idx}${q.page ? `&p=${q.page}` : ""}`;
      await sb.from("stuck_questions").upsert({ stuck_id: sp.id, user_id: userId, book_href: href, question_id: questionId, where_stuck: excerpt });
    }
    await syncFocus(sb, userId);
    refresh();
    return sp.id as string;
  });
}
