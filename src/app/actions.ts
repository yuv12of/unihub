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
  if (!supabaseEnabled) throw new Error("Supabase is not configured");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const email = (data?.claims?.email as string | undefined)?.toLowerCase();
  if (!userId || !email) throw new Error("Not signed in");
  if (allowedEmails.length && !allowedEmails.includes(email)) throw new Error("Not allowed");

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
