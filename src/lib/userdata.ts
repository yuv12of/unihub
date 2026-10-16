import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { semester, type Course } from "@/lib/semester";
import { defaultPrefs, type Exam, type Plan, type StudyPrefs } from "@/lib/planner";
import { planFor } from "@/lib/planfor";
import { coursesFor, getProgress, type ProgressMap } from "@/lib/progress";

/** Signed-in user's exam dates for the current semester. */
export async function getExams(): Promise<Exam[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("exams")
    .select("course_code, moed, date, start_time")
    .eq("semester", semester.semester)
    .order("date");
  return (data ?? []) as Exam[];
}

export async function getPrefs(): Promise<StudyPrefs> {
  if (!supabaseEnabled) return defaultPrefs;
  const supabase = await createClient();
  const { data } = await supabase
    .from("study_prefs")
    .select("availability, session_minutes, fill_routine")
    .maybeSingle();
  return data ? { ...defaultPrefs, ...(data as StudyPrefs) } : defaultPrefs;
}

/** The private calendar feed token, or null if the user hasn't created one yet. */
export async function getFeedToken(): Promise<string | null> {
  if (!supabaseEnabled) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("calendar_feeds").select("token").maybeSingle();
  return data?.token ?? null;
}


export interface UserEvent {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  kind: "custom" | "tutorial" | "other";
  course_code: string | null;
  location: string | null;
  source: string;
  cancelled: boolean;
}

export async function getEvents(): Promise<UserEvent[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_events")
    .select("id, date, start_time, end_time, title, kind, course_code, location, source, cancelled")
    .order("date");
  return (data ?? []) as UserEvent[];
}

export async function getSessionRows(): Promise<{ session_key: string; status: "done" | "skipped"; minutes: number | null }[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("session_status").select("session_key, status, minutes");
  return data ?? [];
}


export interface UserPlan {
  progress: ProgressMap;
  exams: Exam[];
  prefs: StudyPrefs;
  events: UserEvent[];
  status: Record<string, "done" | "skipped">;
  plan: Plan;
  /** Courses with this user's deadline extensions applied. */
  courses: Course[];
}


/** Everything needed to show the plan, loaded in parallel. */
export async function getUserPlan(today: string): Promise<UserPlan> {
  const [progress, exams, prefs, events, rows] = await Promise.all([
    getProgress(),
    getExams(),
    getPrefs(),
    getEvents(),
    getSessionRows(),
  ]);
  const status = Object.fromEntries(rows.map((r) => [r.session_key, r.status]));
  const plan = planFor({ today, prefs, progress, exams, events, rows });
  return { progress, exams, prefs, events, status, plan, courses: coursesFor(progress) };
}

export async function getIngestToken(): Promise<string | null> {
  if (!supabaseEnabled) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("ingest_tokens").select("token").maybeSingle();
  return data?.token ?? null;
}

export interface Mail {
  id: string;
  sender: string | null;
  subject: string | null;
  received_at: string;
  body_text: string | null;
  body_html: string | null;
  summary: string | null;
  category: string | null;
  action_items: { text: string; date?: string }[] | null;
  is_read: boolean;
  attachments: { id: string; filename: string | null; size_bytes: number | null }[];
}

export async function getMails(limit = 200): Promise<Mail[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("mails")
    .select(
      "id, sender, subject, received_at, body_text, body_html, summary, category, action_items, is_read, attachments:mail_attachments(id, filename, size_bytes)",
    )
    .order("received_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Mail[];
}

export interface Card {
  id: string;
  course_code: string;
  topic: string | null;
  kind: "mcq" | "flash";
  front: string;
  back: string | null;
  options: string[] | null;
  answer_index: number | null;
  explanation: string | null;
  due_at: string;
  reps: number;
}

export async function getCardStats(): Promise<{ due: Card[]; total: number; byCourse: Record<string, { total: number; due: number }> }> {
  if (!supabaseEnabled) return { due: [], total: 0, byCourse: {} };
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [{ data: due }, { data: all }] = await Promise.all([
    supabase
      .from("cards")
      .select("id, course_code, topic, kind, front, back, options, answer_index, explanation, due_at, reps")
      .lte("due_at", now)
      .order("due_at")
      .limit(60),
    supabase.from("cards").select("course_code, due_at"),
  ]);
  const byCourse: Record<string, { total: number; due: number }> = {};
  for (const c of all ?? []) {
    byCourse[c.course_code] ??= { total: 0, due: 0 };
    byCourse[c.course_code].total++;
    if (c.due_at <= now) byCourse[c.course_code].due++;
  }
  return { due: (due ?? []) as Card[], total: all?.length ?? 0, byCourse };
}

export interface Note {
  id: string;
  name: string;
  folder: string | null;
  course_code: string | null;
  url: string | null;
  modified_at: string | null;
  summary: string | null;
  has_text: boolean;
}

export async function getNotes(): Promise<Note[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("notes")
    .select("id, name, folder, course_code, url, modified_at, summary, text_content")
    .order("modified_at", { ascending: false })
    .limit(300);
  return (data ?? []).map(({ text_content, ...n }) => ({ ...n, has_text: !!text_content?.trim() })) as Note[];
}

export interface Update {
  id: string;
  kind: "deadline" | "tutorial_cancel" | "tutorial_new" | "grade" | "info";
  title: string;
  detail: string | null;
  status: "pending" | "applied" | "dismissed";
  created_at: string;
  mail_id: string | null;
}

/** Pending updates from mail, plus ones applied automatically in the last 5 days. */
export async function getUpdates(): Promise<Update[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const since = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("updates")
    .select("id, kind, title, detail, status, created_at, mail_id")
    .or(`status.eq.pending,and(status.eq.applied,created_at.gte.${since})`)
    .order("created_at", { ascending: false })
    .limit(12);
  return (data ?? []) as Update[];
}

export interface OpalFeed {
  url: string;
  last_synced_at: string | null;
  last_status: string | null;
  last_count: number | null;
}

export async function getOpalFeed(): Promise<OpalFeed | null> {
  if (!supabaseEnabled) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("external_feeds").select("url, last_synced_at, last_status, last_count").eq("kind", "opal").maybeSingle();
  // The page only needs to show that a link is saved; the key part never goes to the browser.
  return data ? { ...data, url: data.url.replace(/authtoken=[^&]+/, "authtoken=••••") } : null;
}
