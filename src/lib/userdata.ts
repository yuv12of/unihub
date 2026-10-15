import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { semester } from "@/lib/semester";
import { buildPlan, defaultPrefs, type Exam, type Plan, type StudyPrefs } from "@/lib/planner";
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


export interface UserPlan {
  progress: ProgressMap;
  exams: Exam[];
  prefs: StudyPrefs;
  plan: Plan;
}

/** Everything needed to show the plan, loaded in parallel. */
export async function getUserPlan(today: string): Promise<UserPlan> {
  const [progress, exams, prefs] = await Promise.all([getProgress(), getExams(), getPrefs()]);
  return { progress, exams, prefs, plan: buildPlan({ today, prefs, progress, exams }) };
}
