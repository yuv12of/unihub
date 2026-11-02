"use server";
import { revalidatePath } from "next/cache";
import { action, must } from "@/app/guard";
import { adminClient } from "@/lib/supabase/admin";
import { ASSIGNMENT_FILE_MAX, BOOKLET, answerFor, linkFor, semesterSlug, sheetFor } from "@/lib/assignmentFiles";
import { isUsable, parseSheet, partItems, type PartItem, type SheetStructure } from "@/lib/sheetStructure";
import { detectedIn, findSolutionNote, hasIdNumber, solutionNumbers, type NoteHeadings } from "@/lib/submitCheck";
import { pdfText } from "@/lib/pdfText";
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
    const path = `${userId}/${code}/${semesterSlug(semester.semester)}/${Date.now().toString(36)}-${safeName(String(name ?? "file"))}`;
    const { data, error } = await admin().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error) throw new Error(error.message);
    return { path, url: data.signedUrl };
  });
}

/** After the upload: record which assignment (or the booklet) the file is: its sheet, or what I submitted. */
export async function addAssignmentFile(code: string, n: string, name: string, path: string, size: number, kind: "sheet" | "answer" = "sheet") {
  return action("addAssignmentFile", async ({ supabase, userId }) => {
    if (!CODE.test(code) || !N.test(n)) throw new Error("מטלה לא תקינה");
    if (kind !== "sheet" && kind !== "answer") throw new Error("סוג קובץ לא תקין");
    if (kind === "answer" && n === BOOKLET) throw new Error("ההגשה שייכת למטלה אחת");
    if (!path.startsWith(`${userId}/${code}/${semesterSlug(semester.semester)}/`) || path.includes("..")) throw new Error("נתיב לא תקין");
    const title = String(name ?? "").trim().slice(0, 200) || "דף המטלה";
    const { data, error } = await supabase
      .from("assignment_files")
      .insert({ user_id: userId, course_code: code, semester: semester.semester, n, kind, name: title, path, size: Math.round(size) || null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    refresh(code);
    return { id: data.id as string };
  });
}

const httpsUrl = (u: string | null | undefined, max: number) => {
  const v = String(u ?? "").trim();
  if (!v) return null;
  if (!/^https:\/\/\S+$/.test(v) || v.length > max) throw new Error("צריך קישור שמתחיל ב־https://");
  return v;
};

/** An online assignment's link (empty removes it). */
export async function setAssignmentLink(code: string, n: string, url: string) {
  return action("setAssignmentLink", async ({ supabase, userId }) => {
    if (!CODE.test(code) || !/^\d{1,3}$/.test(n)) throw new Error("מטלה לא תקינה");
    const v = httpsUrl(url, 1000);
    must(await supabase.from("assignment_files").delete().match({ course_code: code, semester: semester.semester, n, kind: "sheet" }).not("url", "is", null));
    if (v) must(await supabase.from("assignment_files").insert({ user_id: userId, course_code: code, semester: semester.semester, n, kind: "sheet", name: `מטלה ${n}`, url: v }));
    refresh(code);
  });
}

/** The course's page with all its assignments (on Opal). Empty removes it. */
export async function setAssignmentsUrl(code: string, url: string) {
  return action("setAssignmentsUrl", async ({ supabase, userId }) => {
    if (!CODE.test(code)) throw new Error("קורס לא תקין");
    must(await supabase.from("user_courses").update({ assignments_url: httpsUrl(url, 500) }).match({ user_id: userId, course_code: code, semester: semester.semester }));
    refresh(code);
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
    if (data.path) await admin().storage.from(BUCKET).remove([data.path]);
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
  /** the stored PDF sheet, opened at the saved page (null for an online assignment) */
  sheet: { fileId: string; name: string; url: string; page: number } | null;
  /** an online assignment's link on Opal */
  link: string | null;
  /** the course's assignments that have a sheet or a link, to switch without leaving the timer */
  options: { n: string; label: string; online: boolean }[];
}

/**
 * The assignment to work on in the focus timer: assignment n when given, else the next one due
 * that isn't submitted (with a sheet or a link). A file assignment comes with its PDF (signed link,
 * opened at the saved page); an online one with its Opal link. Null when nothing was added.
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
    const files = (rows ?? []).map((r) => ({ ...r, pdf: !!r.path && /\.pdf$/i.test(r.path) }));
    if (!files.length) return null;
    const list = courses.find((c) => c.code === code)?.assignments ?? [];
    const label = (n: string) => {
      const a = list.find((x) => x.n === n);
      return n === BOOKLET ? "חוברת המטלות" : `${a ? typeLabel[a.type] : "מטלה"} ${n}`;
    };
    const has = (n: string) => !!sheetFor(files, n) || !!linkFor(files, n);
    const closed = new Set((progress ?? []).filter((p) => p.status === "submitted" || p.status === "skipped").map((p) => p.n));
    const today = todayInIsrael();
    const wanted = input.n && N.test(input.n) ? input.n : null;
    const next = [...list].filter((a) => a.due >= today && !closed.has(a.n) && has(a.n)).sort((a, b) => a.due.localeCompare(b.due))[0]?.n;
    const n = wanted ?? next ?? list.find((a) => has(a.n))?.n;
    if (!n) return null;
    const file = sheetFor(files, n);
    let sheet: FocusAssignment["sheet"] = null;
    if (file?.path) {
      const { data: signed } = await admin().storage.from(BUCKET).createSignedUrl(file.path, 3600);
      if (signed?.signedUrl) sheet = { fileId: file.id, name: file.name, url: signed.signedUrl, page: file.last_page ?? 1 };
    }
    const link = sheet ? null : (linkFor(files, n)?.url ?? null);
    if (!sheet && !link) return null;
    return {
      course: code,
      n,
      label: label(n),
      sheet,
      link,
      options: list.filter((a) => has(a.n)).map((a) => ({ n: a.n, label: label(a.n), online: !sheetFor(files, a.n) })),
    };
  });
}

export interface SubmitCheck {
  n: string;
  /** "ok": parts read from the sheet; "notext": a scanned sheet; "none": no sheet uploaded */
  sheet: "ok" | "notext" | "none";
  questions: { q: number; points: number | null; items: PartItem[] }[];
  /** my solution among the synced Notability notes */
  note: {
    name: string;
    url: string | null;
    modified: string | null;
    ocr: boolean;
    hasId: boolean;
    /** automatic part detection: "off" never ran (no Gemini key), "stale" a newer version is waiting */
    detect: "off" | "ok" | "stale" | "error";
    detectError: string | null;
  } | null;
  /** sheet parts whose heading the solution has, with writing under it */
  detected: string[];
  /** sheet parts whose heading is there but nothing is written under it */
  emptyParts: string[];
  /** the file I submitted, saved in Unihub */
  answer: string | null;
}

/**
 * "Ready to submit" for one file assignment: every part the sheet asks for (read from the sheet's
 * PDF text once, then kept), and what can be checked about my solution without reading it.
 * Fills the tracker's question count from the sheet when it is still empty.
 */
export async function getSubmitCheck(code: string, n: string): Promise<SubmitCheck | { failed: string }> {
  return action("getSubmitCheck", async ({ supabase, userId }) => {
    if (!CODE.test(code) || !/^\d{2}$/.test(n)) throw new Error("מטלה לא תקינה");
    const key = { course_code: code, semester: semester.semester };
    const [courses, { data: rows }, { data: notes }, { data: qrows }] = await Promise.all([
      getCourses(),
      supabase.from("assignment_files").select("id, n, kind, name, path, url, structure").match(key).order("created_at"),
      supabase.from("notes").select("id, name, folder, course_code, url, modified_at").eq("course_code", code).order("modified_at", { ascending: false }).limit(200),
      supabase.from("assignment_questions").select("q").match({ ...key, n }).limit(1),
    ]);
    const list = courses.find((c) => c.code === code)?.assignments ?? [];
    if (!list.some((a) => a.n === n && a.type === "file")) throw new Error("מטלה לא מוכרת");
    const files = (rows ?? []).map((r) => ({ ...r, pdf: !!r.path && /\.pdf$/i.test(r.path) }));

    // the sheet's structure: stored, or read now from its text layer
    const file = sheetFor(files, n);
    let structure = (file?.structure as SheetStructure | null) ?? null;
    if (file?.path && !structure) {
      structure = { questions: [] };
      try {
        const { data: blob } = await admin().storage.from(BUCKET).download(file.path);
        if (blob) structure = parseSheet(await pdfText(new Uint8Array(await blob.arrayBuffer()), 40));
      } catch {}
      await supabase.from("assignment_files").update({ structure }).eq("id", file.id);
    }
    // a booklet holds every assignment: its questions can't be told apart, so no parts from it
    const usable = file && file.n === n && isUsable(structure) ? structure : null;
    if (usable && !qrows?.length) {
      const qs = usable.questions.map((x) => ({ user_id: userId, ...key, n, q: x.q }));
      const { error } = await supabase.from("assignment_questions").upsert(qs, { onConflict: "user_id,course_code,semester,n,q", ignoreDuplicates: true });
      if (!error) refresh(code);
    }

    const found = findSolutionNote(notes ?? [], code, solutionNumbers(list, n));
    let note: SubmitCheck["note"] = null;
    let headings: NoteHeadings | null = null;
    if (found) {
      const { data: t } = await supabase.from("notes").select("text_content, headings, headings_for, headings_error").eq("id", found.id).maybeSingle();
      const text = (t?.text_content as string | null) ?? "";
      const at = (t?.headings_for as string | null) ?? null;
      const current = !!at && !!found.modified_at && new Date(at).getTime() >= new Date(found.modified_at).getTime();
      const detect: NonNullable<SubmitCheck["note"]>["detect"] = !at && !t?.headings_error ? "off" : !current ? "stale" : t?.headings_error ? "error" : "ok";
      note = {
        name: found.name.replace(/\.pdf$/i, ""),
        url: found.url,
        modified: found.modified_at,
        ocr: !!text.trim(),
        hasId: hasIdNumber(text),
        detect,
        detectError: detect === "error" ? String(t?.headings_error).slice(0, 200) : null,
      };
      if (detect === "ok" && t?.headings) headings = t.headings as NoteHeadings;
    }
    const itemKeys = (usable?.questions ?? []).flatMap((x) => partItems(x).map((i) => i.key));
    const foundKeys = new Set(headings?.keys ?? []);
    const emptyKeys = new Set(headings?.empty ?? []);
    const detected = itemKeys.filter((k) => detectedIn(foundKeys, k));
    const emptyParts = itemKeys.filter((k) => !detected.includes(k) && detectedIn(emptyKeys, k));

    return {
      n,
      sheet: !file ? "none" : usable ? "ok" : "notext",
      questions: (usable?.questions ?? []).map((x) => ({ q: x.q, points: x.points, items: partItems(x) })),
      note,
      detected,
      emptyParts,
      answer: answerFor(files, n)?.name ?? null,
    } satisfies SubmitCheck;
  });
}
