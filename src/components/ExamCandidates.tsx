import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getCourses } from "@/lib/userdata";
import { semester, themeOf } from "@/lib/semester";
import { ExamCandidateList, type Candidate } from "@/components/ExamCandidateList";

/** Today: exam dates found in university mail, waiting for "הוספה" / "לא נכון". Nothing when none. */
export async function ExamCandidates() {
  if (!supabaseEnabled) return null;
  const sb = await createClient();
  const { data, error } = await sb
    .from("exam_candidates")
    .select("id, course_code, moed, date, start_time")
    .eq("status", "pending")
    .eq("semester", semester.semester)
    .order("date");
  if (error || !data?.length) return null;
  const courses = await getCourses();
  const rows: Candidate[] = data.map((c) => ({ ...c, short: themeOf(courses, c.course_code).short, color: themeOf(courses, c.course_code).color }));
  return <ExamCandidateList rows={rows} />;
}
