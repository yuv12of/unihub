import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { semester } from "@/lib/semester";
import { buildPlan, defaultPrefs, type Busy, type Exam, type Plan, type StudyPrefs } from "@/lib/planner";
import { getProgress, type ProgressMap } from "@/lib/progress";

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
}

export async function getEvents(): Promise<UserEvent[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_events")
    .select("id, date, start_time, end_time, title, kind, course_code, location, source")
    .order("date");
  return (data ?? []) as UserEvent[];
}

export async function getSessionStatus(): Promise<Record<string, "done" | "skipped">> {
  if (!supabaseEnabled) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("session_status").select("session_key, status");
  return Object.fromEntries((data ?? []).map((r) => [r.session_key, r.status]));
}

export function busyFromEvents(events: Pick<UserEvent, "date" | "start_time" | "end_time" | "kind">[]): Busy[] {
  // Optional things (phone tutoring hours, registration dates) don't block study time.
  return events
    .filter((e) => e.start_time && e.end_time && e.kind !== "other")
    .map((e) => ({ date: e.date, start: e.start_time!, end: e.end_time! }));
}

export interface UserPlan {
  progress: ProgressMap;
  exams: Exam[];
  prefs: StudyPrefs;
  events: UserEvent[];
  status: Record<string, "done" | "skipped">;
  plan: Plan;
}

/** Everything needed to show the plan, loaded in parallel. */
export async function getUserPlan(today: string): Promise<UserPlan> {
  const [progress, exams, prefs, events, status] = await Promise.all([
    getProgress(),
    getExams(),
    getPrefs(),
    getEvents(),
    getSessionStatus(),
  ]);
  const plan = buildPlan({ today, prefs, progress, exams, busy: busyFromEvents(events) });
  return { progress, exams, prefs, events, status, plan };
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
