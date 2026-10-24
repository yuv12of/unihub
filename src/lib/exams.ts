/**
 * Exams: the runway before the chosen מועד, the past-exam bank and timed mock attempts.
 * Loaders return empty data when the tables are missing (before migration 0021) or signed out.
 */
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { academicEvents } from "@/lib/academic";
import { semester } from "@/lib/semester";
import { nextExams, MOCK_TITLE, type Exam, type Session } from "@/lib/planner";

export interface PastExam {
  id: string;
  course_code: string;
  label: string;
  url: string | null;
  duration_minutes: number;
  questions: number;
  created_at: string;
}

export interface MockScore {
  q: number;
  /** percent of the question's points, self-graded */
  score: number;
  minutes: number;
}

export interface MockAttempt {
  id: string;
  exam_id: string;
  started_at: string;
  finished_at: string | null;
  scores: MockScore[];
}

export async function getPastExams(code: string): Promise<PastExam[]> {
  if (!supabaseEnabled) return [];
  const sb = await createClient();
  const { data, error } = await sb.from("past_exams").select("id, course_code, label, url, duration_minutes, questions, created_at").eq("course_code", code).order("label", { ascending: false });
  return error ? [] : ((data ?? []) as PastExam[]);
}

export async function getPastExam(id: string): Promise<PastExam | null> {
  if (!supabaseEnabled || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const sb = await createClient();
  const { data, error } = await sb.from("past_exams").select("id, course_code, label, url, duration_minutes, questions, created_at").eq("id", id).maybeSingle();
  return error ? null : ((data as PastExam | null) ?? null);
}

export async function getMockAttempts(examIds: string[]): Promise<MockAttempt[]> {
  if (!supabaseEnabled || !examIds.length) return [];
  const sb = await createClient();
  const { data, error } = await sb.from("mock_attempts").select("id, exam_id, started_at, finished_at, scores").in("exam_id", examIds).order("started_at", { ascending: false });
  return error ? [] : ((data ?? []) as MockAttempt[]);
}

/** Average score of an attempt (percent), null when nothing was graded. */
export function attemptScore(a: Pick<MockAttempt, "scores">): number | null {
  if (!a.scores?.length) return null;
  return Math.round(a.scores.reduce((s, x) => s + x.score, 0) / a.scores.length);
}

/** Questions under 60%: they become stuck points so they come back in practice. */
export function weakQuestions(scores: MockScore[]): MockScore[] {
  return scores.filter((s) => s.score < 60);
}

/** The exam this course is aiming at (chosen מועד, else the earliest upcoming). */
export function aimedExam(exams: Exam[], code: string, today: string): Exam | null {
  return nextExams(exams.filter((e) => e.course_code === code), today)[0] ?? null;
}

export interface Runway {
  sessions: Session[];
  minutes: number;
  mocks: number;
  first: string | null;
}

/** Revision planned for the course between today and the exam (exam sessions + exam-period study). */
export function runway(sessions: Session[], code: string, exam: Exam, today: string): Runway {
  const list = sessions.filter(
    (s) => s.courseCode === code && s.date >= today && s.date < exam.date && (s.kind === "exam" || (s.kind === "routine" && (s.ref ?? "").startsWith("exam"))),
  );
  return {
    sessions: list,
    minutes: list.reduce((t, s) => t + s.minutes, 0),
    mocks: list.filter((s) => s.title.startsWith(MOCK_TITLE)).length,
    first: list[0]?.date ?? null,
  };
}

/**
 * Last day of the semester (from the OU yearly timetable): exams come after it. Used as the
 * provisional horizon while exam dates aren't published.
 */
export function semesterEnd(): string {
  return academicEvents.find((e) => e.title === `סיום סמסטר ${semester.semester}`)?.date ?? "2027-01-31";
}
