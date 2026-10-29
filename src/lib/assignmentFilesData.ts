import "server-only";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { semester } from "@/lib/semester";
import type { AssignmentFile, AssignmentFileKind } from "@/lib/assignmentFiles";

export type AssignmentFileRow = AssignmentFile & { path: string | null };

/**
 * This semester's assignment files of a course: sheets, online links and submitted files, plus the
 * course's "all assignments" link (empty before migrations 0030–0031).
 */
export async function getAssignmentFiles(code: string): Promise<{ files: AssignmentFileRow[]; allUrl: string | null }> {
  if (!supabaseEnabled) return { files: [], allUrl: null };
  const sb = await createClient();
  const [{ data, error }, { data: uc }] = await Promise.all([
    sb.from("assignment_files").select("id, n, kind, name, size, path, url, last_page").match({ course_code: code, semester: semester.semester }).order("n").order("created_at"),
    sb.from("user_courses").select("assignments_url").match({ course_code: code, semester: semester.semester }).maybeSingle(),
  ]);
  const files = error
    ? []
    : (data ?? []).map((r) => ({
        id: r.id as string,
        n: r.n as string,
        kind: (r.kind ?? "sheet") as AssignmentFileKind,
        name: r.name as string,
        size: r.size as number | null,
        path: r.path as string | null,
        url: r.url as string | null,
        lastPage: r.last_page as number | null,
      }));
  return { files, allUrl: (uc?.assignments_url as string | null | undefined) ?? null };
}

/** A short-lived (1 hour) link to one stored assignment file. */
export async function assignmentFileUrl(path: string, download?: string): Promise<string | null> {
  const admin = adminClient();
  if (!admin) return null;
  const { data } = await admin.storage.from("assignment-files").createSignedUrl(path, 3600, download ? { download } : undefined);
  return data?.signedUrl ?? null;
}

/** Short-lived links for several stored files at once (path → link). */
export async function assignmentFileUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const admin = paths.length ? adminClient() : null;
  if (!admin) return out;
  const { data } = await admin.storage.from("assignment-files").createSignedUrls(paths, 3600);
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}
