import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Overnight marking of handwritten practice. A Notability page named "תרגול 20109 3.2" syncs to the
 * notes table; the 05:25 scheduled task reads it and writes a practice_marks row (first wrong line +
 * a hint, never the full solution). See docs/scheduled-tasks.md.
 */
export interface PracticeMark {
  id: string;
  note_id: string;
  page: number;
  course_code: string | null;
  exercise: string | null;
  verdict: "correct" | "error" | "unclear" | null;
  first_wrong_line: string | null;
  feedback: string;
  created_at: string;
  seen: boolean;
  note: { name: string; url: string | null } | null;
}

/** "תרגול 20109 3.2.pdf" → { course: "20109", exercise: "3.2" }; also "תרגול 20109 ממן-מבחן 2024א 3". */
export function parsePracticeName(name: string): { course: string; exercise: string | null } | null {
  const m = name.replace(/\.pdf$/i, "").match(/^\s*(?:תרגול|מבחן)\s+(\d{5})(?:\s+(.+?))?\s*$/);
  return m ? { course: m[1], exercise: m[2]?.trim() || null } : null;
}

/** Recent marks, newest first (empty until migration 0022 is applied). */
export async function getPracticeMarks({ unseenOnly = false, limit = 20 } = {}): Promise<PracticeMark[]> {
  if (!supabaseEnabled) return [];
  const sb = await createClient();
  let q = sb
    .from("practice_marks")
    .select("id, note_id, page, course_code, exercise, verdict, first_wrong_line, feedback, created_at, seen, note:notes(name, url)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (unseenOnly) q = q.eq("seen", false);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as unknown as PracticeMark[];
}
