import "server-only";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { semester } from "@/lib/semester";
import type { AssignmentFile } from "@/lib/assignmentFiles";

/** This semester's assignment sheets of a course (empty before migration 0030 or when none). */
export async function getAssignmentFiles(code: string): Promise<(AssignmentFile & { path: string })[]> {
  if (!supabaseEnabled) return [];
  const sb = await createClient();
  const { data, error } = await sb
    .from("assignment_files")
    .select("id, n, name, size, path, last_page")
    .match({ course_code: code, semester: semester.semester })
    .order("n")
    .order("created_at");
  if (error) return [];
  return (data ?? []).map((r) => ({ id: r.id, n: r.n, name: r.name, size: r.size, path: r.path, lastPage: r.last_page }));
}

/** A short-lived (1 hour) link to one stored assignment file. */
export async function assignmentFileUrl(path: string): Promise<string | null> {
  const admin = adminClient();
  if (!admin) return null;
  const { data } = await admin.storage.from("assignment-files").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
