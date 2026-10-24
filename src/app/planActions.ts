"use server";
/**
 * Planning actions: exam dates and the chosen מועד, the past-exam bank and mock exams,
 * ממ"ן questions and the submission checklist. All return { failed } on error.
 */
import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnabled } from "@/lib/supabase/config";
import { semester, typeLabel } from "@/lib/semester";
import { CHECKLIST, type QStatus } from "@/lib/tracker";
import { weakQuestions, type MockScore } from "@/lib/exams";
import type { Failed } from "@/app/actions";

async function g<T>(fn: () => Promise<T>): Promise<T | Failed> {
  try {
    return await fn();
  } catch (e) {
    return { failed: e instanceof Error && e.message ? e.message : "שגיאה" };
  }
}

async function user() {
  if (!supabaseEnabled) throw new Error("לא מחובר");
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) throw new Error("לא מחובר");
  const { data: profile } = await sb.from("profiles").select("status").maybeSingle();
  if (profile?.status !== "approved") throw new Error("החשבון עוד לא אושר");
  return { sb, userId };
}

const CODE = /^\d{5}$/;
const N = /^\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
const missingTable = (msg: string) => /does not exist|schema cache|column/i.test(msg);
const notReady = "התכונה תעבוד אחרי עדכון מסד הנתונים";

/** One of my courses this semester, with its assignments. */
async function myCourse(sb: Awaited<ReturnType<typeof createClient>>, code: string) {
  if (!CODE.test(code)) throw new Error("קורס לא מוכר");
  const { data } = await sb
    .from("user_courses")
    .select("course_code, course:courses(name, assignments(n, type))")
    .match({ course_code: code, semester: semester.semester })
    .maybeSingle();
  if (!data) throw new Error("הקורס לא ברשימה שלך");
  return data.course as unknown as { name: string; assignments: { n: string; type: "file" | "online" | "participation" }[] };
}

/** Recounts open stuck points per course into study prefs (the planner gives those courses more time). */
async function syncFocus(sb: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await sb.from("stuck_points").select("course_code").match({ user_id: userId, resolved: false });
  const focus: Record<string, number> = {};
  for (const r of data ?? []) if (r.course_code) focus[r.course_code] = (focus[r.course_code] ?? 0) + 1;
  await sb.from("study_prefs").update({ focus }).eq("user_id", userId);
}

// ---------- Exam dates ----------

export interface ExamInput {
  code: string;
  a: { date: string; time: string };
  b: { date: string; time: string };
  /** the מועד I plan to take */
  chosen: "א" | "ב";
  /** plan weekly mock exams in the last three weeks */
  mocks: boolean;
}

/** Saves both מועדים of a course, which one I'm taking, and whether to plan mock exams. */
export async function saveCourseExams(input: ExamInput) {
  return g(async () => {
    const { sb, userId } = await user();
    await myCourse(sb, input.code);
    for (const [moed, v] of [["א", input.a], ["ב", input.b]] as const) {
      const key = { user_id: userId, course_code: input.code, semester: semester.semester, moed };
      const date = String(v?.date ?? "");
      const time = String(v?.time ?? "");
      if (!date) {
        const { error } = await sb.from("exams").delete().match(key);
        if (error) throw new Error("לא נשמר");
        continue;
      }
      if (!isDate(date)) throw new Error(`התאריך של מועד ${moed} לא תקין`);
      if (time && !TIME.test(time)) throw new Error(`השעה של מועד ${moed} לא תקינה`);
      const row = { ...key, date, start_time: time || null };
      const { error } = await sb.from("exams").upsert({ ...row, chosen: input.chosen === moed, mocks: !!input.mocks });
      if (error && missingTable(error.message)) {
        // before migration 0021: keep the dates at least
        const { error: e2 } = await sb.from("exams").upsert(row);
        if (e2) throw new Error("לא נשמר");
      } else if (error) throw new Error("לא נשמר");
    }
    if (input.a.date && input.b.date && input.a.date >= input.b.date) throw new Error("נשמר, אבל מועד א אחרי מועד ב. כדאי לבדוק את התאריכים");
    refresh();
    return true;
  });
}

// ---------- Past-exam bank ----------

export async function addPastExam(input: { code: string; label: string; url?: string | null; duration?: number; questions?: number }) {
  return g(async () => {
    const { sb, userId } = await user();
    await myCourse(sb, input.code);
    let url = (input.url ?? "").trim() || null;
    let label = (input.label ?? "").trim();
    if (!label && url) label = decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? "").replace(/\.pdf$/i, "").slice(0, 120);
    if (!label) throw new Error("איזו בחינה? למשל: 2025ב מועד 83");
    if (url && !/^https?:\/\/\S+$/.test(url)) throw new Error("הקישור צריך להתחיל ב־https://");
    if (url && url.length > 1000) url = url.slice(0, 1000);
    const duration = Math.max(15, Math.min(600, Math.round(Number(input.duration) || 180)));
    const questions = Math.max(0, Math.min(30, Math.round(Number(input.questions) || 0)));
    const { data, error } = await sb
      .from("past_exams")
      .insert({ user_id: userId, course_code: input.code, label: label.slice(0, 120), url, duration_minutes: duration, questions })
      .select("id")
      .single();
    if (error) throw new Error(missingTable(error.message) ? notReady : "לא נשמר");
    refresh();
    return data.id as string;
  });
}

export async function deletePastExam(id: string) {
  return g(async () => {
    const { sb, userId } = await user();
    const { error } = await sb.from("past_exams").delete().match({ id, user_id: userId });
    if (error) throw new Error("לא נמחק");
    refresh();
    return true;
  });
}

/** Starts a timed attempt (the clock is the server's). */
export async function startMock(examId: string) {
  return g(async () => {
    const { sb, userId } = await user();
    const { data: exam } = await sb.from("past_exams").select("id").match({ id: examId, user_id: userId }).maybeSingle();
    if (!exam) throw new Error("הבחינה לא נמצאה");
    const { data, error } = await sb.from("mock_attempts").insert({ user_id: userId, exam_id: examId }).select("id, started_at").single();
    if (error) throw new Error(missingTable(error.message) ? notReady : "לא התחיל");
    return data as { id: string; started_at: string };
  });
}

/** Ends an attempt with the self-graded scores. Questions under 60% become stuck points. */
export async function finishMock(input: { attemptId: string; scores: MockScore[] }) {
  return g(async () => {
    const { sb, userId } = await user();
    const { data: att } = await sb
      .from("mock_attempts")
      .select("id, exam:past_exams(course_code, label)")
      .match({ id: input.attemptId, user_id: userId })
      .maybeSingle();
    if (!att) throw new Error("הניסיון לא נמצא");
    const scores: MockScore[] = (input.scores ?? []).slice(0, 30).map((s) => ({
      q: Math.max(1, Math.min(30, Math.round(Number(s.q) || 1))),
      score: Math.max(0, Math.min(100, Math.round(Number(s.score) || 0))),
      minutes: Math.max(0, Math.min(600, Math.round(Number(s.minutes) || 0))),
    }));
    const { error } = await sb.from("mock_attempts").update({ finished_at: new Date().toISOString(), scores }).eq("id", att.id);
    if (error) throw new Error("לא נשמר");
    const exam = att.exam as unknown as { course_code: string; label: string } | null;
    const weak = weakQuestions(scores);
    if (exam && weak.length) {
      await sb.from("stuck_points").insert(
        weak.map((w) => ({ user_id: userId, course_code: exam.course_code, topic: `בחינה ${exam.label}, שאלה ${w.q} (${w.score}%)`.slice(0, 300) })),
      );
      await syncFocus(sb, userId);
    }
    refresh();
    return { stuck: weak.length };
  });
}

// ---------- ממ"ן questions and checklist ----------

/** Sets how many questions an assignment has (rows 1..count; extra rows are removed). */
export async function setQuestionCount(input: { code: string; n: string; count: number }) {
  return g(async () => {
    const { sb, userId } = await user();
    const c = await myCourse(sb, input.code);
    if (!N.test(input.n) || !c.assignments.some((a) => a.n === input.n)) throw new Error("מטלה לא מוכרת");
    const count = Math.max(0, Math.min(20, Math.round(Number(input.count) || 0)));
    const key = { user_id: userId, course_code: input.code, semester: semester.semester, n: input.n };
    const del = await sb.from("assignment_questions").delete().match(key).gt("q", count);
    if (del.error) throw new Error(missingTable(del.error.message) ? notReady : "לא נשמר");
    if (count) {
      const rows = Array.from({ length: count }, (_, i) => ({ ...key, q: i + 1 }));
      const { error } = await sb.from("assignment_questions").upsert(rows, { onConflict: "user_id,course_code,semester,n,q", ignoreDuplicates: true });
      if (error) throw new Error("לא נשמר");
    }
    refresh();
    return count;
  });
}

/** One question's status. "stuck" also opens a stuck point, so it comes back in practice. */
export async function setQuestionState(input: { code: string; n: string; q: number; status: QStatus }) {
  return g(async () => {
    const { sb, userId } = await user();
    const c = await myCourse(sb, input.code);
    const a = c.assignments.find((x) => x.n === input.n);
    if (!a) throw new Error("מטלה לא מוכרת");
    if (!["todo", "doing", "done", "stuck"].includes(input.status)) throw new Error("מצב לא מוכר");
    const q = Math.max(1, Math.min(20, Math.round(Number(input.q) || 1)));
    const { error } = await sb
      .from("assignment_questions")
      .upsert({ user_id: userId, course_code: input.code, semester: semester.semester, n: input.n, q, status: input.status, updated_at: new Date().toISOString() });
    if (error) throw new Error(missingTable(error.message) ? notReady : "לא נשמר");
    if (input.status === "stuck") {
      const topic = `${typeLabel[a.type]} ${a.n} ב${c.name}, שאלה ${q}`;
      const { data: open } = await sb.from("stuck_points").select("id").match({ user_id: userId, topic, resolved: false }).limit(1);
      if (!open?.length) await sb.from("stuck_points").insert({ user_id: userId, course_code: input.code, topic });
      await syncFocus(sb, userId);
    }
    refresh();
    return input.status;
  });
}

/** Ticks or unticks one item of the pre-submission checklist. Quiet: no refresh. */
export async function toggleCheck(input: { code: string; n: string; item: string; done: boolean }) {
  return g(async () => {
    const { sb, userId } = await user();
    if (!CODE.test(input.code) || !N.test(input.n) || !CHECKLIST.some((c) => c.id === input.item)) throw new Error("פריט לא מוכר");
    const key = { user_id: userId, course_code: input.code, semester: semester.semester, n: input.n };
    const { data, error: readErr } = await sb.from("assignment_checks").select("checks").match(key).maybeSingle();
    if (readErr) throw new Error(missingTable(readErr.message) ? notReady : "לא נשמר");
    const cur = new Set<string>((data?.checks as string[] | undefined) ?? []);
    if (input.done) cur.add(input.item);
    else cur.delete(input.item);
    const { error } = await sb.from("assignment_checks").upsert({ ...key, checks: [...cur], updated_at: new Date().toISOString() });
    if (error) throw new Error("לא נשמר");
    return [...cur];
  });
}
