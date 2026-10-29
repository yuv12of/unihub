"use server";
import { revalidatePath } from "next/cache";
import { action, must } from "@/app/guard";
import { adminClient } from "@/lib/supabase/admin";
import { ASSIGNMENT_FILE_MAX, BOOKLET, sheetFor } from "@/lib/assignmentFiles";
import { getCourses } from "@/lib/userdata";
import { semester, todayInIsrael, typeLabel } from "@/lib/semester";

const CODE = /^\d{5}$/;
const N = /^(\d{1,3}|all)$/;
const UUID = /^[0-9a-f-]{36}$/;
const BUCKET = "assignment-files";

function admin() {
  const a = adminClient();
  if (!a) throw new Error("העלאת קבצים לא מוגדרת באתר (חסר מפתח שרת)");
  return a;
}

const safeName = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-80)
    .replace(/^_|_$/g, "") || "file";

const refresh = (code: string) => {
  revalidatePath(`/courses/${code}`);
  revalidatePath(`/courses/${code}/assignment/[n]`, "page");
};

/** A signed upload link (2 hours) in the user's folder for this course and semester. */
export async function assignmentUploadUrl(code: string, name: string, size: number) {
  return action("assignmentUploadUrl", async ({ userId }) => {
    if (!CODE.test(code)) throw new Error("קורס לא תקין");
    if (!Number.isFinite(size) || size <= 0) throw new Error("קובץ ריק");
    if (size > ASSIGNMENT_FILE_MAX) throw new Error("הקובץ גדול מ־50MB");
    const path = `${userId}/${code}/${semester.semester}/${Date.now().toString(36)}-${safeName(String(name ?? "file"))}`;
    const { data, error } = await admin().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error) throw new Error(error.message);
    return { path, url: data.signedUrl };
  });
}

/** After the upload: record which assignment (or the booklet) the file is. */
export async function addAssignmentFile(code: string, n: string, name: string, path: string, size: number) {
  return action("addAssignmentFile", async ({ supabase, userId }) => {
    if (!CODE.test(code) || !N.test(n)) throw new Error("מטלה לא תקינה");
    if (!path.startsWith(`${userId}/${code}/${semester.semester}/`) || path.includes("..")) throw new Error("נתיב לא תקין");
    const title = String(name ?? "").trim().slice(0, 200) || "דף המטלה";
    const { data, error } = await supabase
      .from("assignment_files")
      .insert({ user_id: userId, course_code: code, semester: semester.semester, n, name: title, path, size: Math.round(size) || null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    refresh(code);
    return { id: data.id as string };
  });
}

/** Move a file to another assignment (a wrong guess from its name). */
export async function setAssignmentFileN(id: string, n: string) {
  return action("setAssignmentFileN", async ({ supabase }) => {
    if (!UUID.test(id) || !N.test(n)) throw new Error("מטלה לא תקינה");
    const { data } = must(await supabase.from("assignment_files").update({ n }).eq("id", id).select("course_code").maybeSingle());
    if (data) refresh(data.course_code);
  });
}

export async function deleteAssignmentFile(id: string) {
  return action("deleteAssignmentFile", async ({ supabase }) => {
    if (!UUID.test(id)) throw new Error("קובץ לא תקין");
    // RLS: only the user's own row comes back
    const { data } = await supabase.from("assignment_files").select("course_code, path").eq("id", id).maybeSingle();
    if (!data) throw new Error("הקובץ לא נמצא");
    await admin().storage.from(BUCKET).remove([data.path]);
    must(await supabase.from("assignment_files").delete().eq("id", id));
    refresh(data.course_code);
  });
}

/** Remembers the page I stopped at in an assignment file. Quiet: no refresh. */
export async function saveAssignmentPlace(id: string, page: number) {
  return action("saveAssignmentPlace", async ({ supabase }) => {
    if (!UUID.test(id)) throw new Error("קובץ לא תקין");
    must(await supabase.from("assignment_files").update({ last_page: Math.max(1, Math.min(5000, Math.round(page))) }).eq("id", id));
    return true;
  });
}

export interface FocusAssignment {
  course: string;
  n: string;
  /** "ממ״ן 12" */
  label: string;
  fileId: string;
  name: string;
  /** signed link (1 hour) */
  url: string;
  page: number;
  /** the course's assignments that have a sheet, to switch without leaving the timer */
  options: { n: string; label: string }[];
}

/**
 * The assignment sheet to work from in the focus timer: assignment n when given, else the next one
 * due that isn't submitted, opened at the saved page. Null when no sheet was uploaded.
 */
export async function getFocusAssignment(input: { courseCode: string | null; n?: string | null }): Promise<FocusAssignment | null | { failed: string }> {
  return action("getFocusAssignment", async ({ supabase }) => {
    const code = input.courseCode && CODE.test(input.courseCode) ? input.courseCode : null;
    if (!code) return null;
    const [{ data: rows }, courses, { data: progress }] = await Promise.all([
      supabase.from("assignment_files").select("id, n, kind, name, path, url, last_page").match({ course_code: code, semester: semester.semester }).order("created_at"),
      getCourses(),
      supabase.from("assignment_progress").select("n, status").match({ course_code: code, semester: semester.semester }),
    ]);
    const files = rows ?? [];
    if (!files.length) return null;
    const course = courses.find((c) => c.code === code);
    const list = course?.assignments ?? [];
    const label = (n: string) => {
      const a = list.find((x) => x.n === n);
      return n === BOOKLET ? "חוברת המטלות" : `${a ? typeLabel[a.type] : "מטלה"} ${n}`;
    };
    const closed = new Set((progress ?? []).filter((p) => p.status === "submitted" || p.status === "skipped").map((p) => p.n));
    const today = todayInIsrael();
    const wanted = input.n && N.test(input.n) ? input.n : null;
    const next = [...list].filter((a) => a.due >= today && !closed.has(a.n) && sheetFor(files, a.n)).sort((a, b) => a.due.localeCompare(b.due))[0]?.n;
    const n = wanted ?? next ?? files[0].n;
    const file = sheetFor(files, n) ?? files[0];
    if (!file.path) return null;
    const { data: signed } = await admin().storage.from(BUCKET).createSignedUrl(file.path, 3600);
    if (!signed?.signedUrl) return null;
    const withSheet = list.filter((a) => sheetFor(files, a.n)).map((a) => ({ n: a.n, label: label(a.n) }));
    return {
      course: code,
      n,
      label: label(n),
      fileId: file.id,
      name: file.name,
      url: signed.signedUrl,
      page: file.last_page ?? 1,
      options: withSheet.length ? withSheet : [{ n, label: label(n) }],
    };
  });
}
