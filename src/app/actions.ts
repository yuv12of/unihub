"use server";

import { refresh } from "next/cache";
import { allowedEmails, supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { semester } from "@/lib/semester";
import type { Status } from "@/lib/progress";

const STATUSES: Status[] = ["todo", "in_progress", "submitted", "skipped"];

export async function saveProgress(input: {
  code: string;
  n: string;
  status: Status;
  grade?: number | null;
}) {
  const { supabase, userId } = await requireUser();

  const course = semester.courses.find((c) => c.code === input.code);
  if (!course || !course.assignments.some((a) => a.n === input.n)) throw new Error("Unknown assignment");
  if (!STATUSES.includes(input.status)) throw new Error("Bad status");
  const grade =
    input.grade == null || Number.isNaN(input.grade) ? null : Math.max(0, Math.min(100, Math.round(input.grade)));

  const { error } = await supabase.from("assignment_progress").upsert({
    user_id: userId,
    course_code: input.code,
    semester: semester.semester,
    n: input.n,
    status: input.status,
    grade: input.status === "submitted" ? grade : null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  refresh();
}

async function requireUser() {
  if (!supabaseEnabled) throw new Error("Supabase is not configured");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const email = (data?.claims?.email as string | undefined)?.toLowerCase();
  if (!userId || !email) throw new Error("Not signed in");
  if (allowedEmails.length && !allowedEmails.includes(email)) throw new Error("Not allowed");
  return { supabase, userId };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function savePrefs(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const availability: Record<string, { start: string; minutes: number }> = {};
  for (let d = 0; d < 7; d++) {
    const start = String(formData.get(`start-${d}`) ?? "18:00");
    const minutes = formData.get(`on-${d}`) ? Number(formData.get(`minutes-${d}`) ?? 0) : 0;
    if (!TIME.test(start) || !Number.isFinite(minutes) || minutes < 0 || minutes > 600) throw new Error("Bad availability");
    availability[String(d)] = { start, minutes };
  }
  const session = Number(formData.get("session_minutes"));
  if (!Number.isFinite(session) || session < 30 || session > 240) throw new Error("Bad session length");
  const { error } = await supabase.from("study_prefs").upsert({
    user_id: userId,
    availability,
    session_minutes: session,
    fill_routine: formData.get("fill_routine") === "on",
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  refresh();
}

export async function saveExams(formData: FormData) {
  const { supabase, userId } = await requireUser();
  for (const c of semester.courses) {
    for (const moed of ["א", "ב"]) {
      const date = String(formData.get(`date-${c.code}-${moed}`) ?? "");
      const time = String(formData.get(`time-${c.code}-${moed}`) ?? "");
      const key = { user_id: userId, course_code: c.code, semester: semester.semester, moed };
      if (!date) {
        await supabase.from("exams").delete().match(key);
        continue;
      }
      if (!DATE.test(date) || (time && !TIME.test(time))) throw new Error("Bad exam date");
      const { error } = await supabase.from("exams").upsert({ ...key, date, start_time: time || null });
      if (error) throw new Error(error.message);
    }
  }
  refresh();
}

/** Creates the private calendar link, or replaces it (the old link stops working). */
export async function resetFeed() {
  const { supabase, userId } = await requireUser();
  await supabase.from("calendar_feeds").delete().eq("user_id", userId);
  const { error } = await supabase.from("calendar_feeds").insert({ user_id: userId });
  if (error) throw new Error(error.message);
  refresh();
}
