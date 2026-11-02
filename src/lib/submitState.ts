/**
 * "Ready to submit" for one file assignment, for the panel (signed-in client) and for the paths
 * that run without a session (the Apps Script's headings, with the admin client). Every query
 * filters by user_id itself, so it is safe with either client.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { answerFor, sheetFor } from "@/lib/assignmentFiles";
import { isUsable, parseSheet, partItems, type PartItem, type SheetStructure } from "@/lib/sheetStructure";
import { detectedIn, findSolutionNote, hasIdNumber, solutionNumbers, type NoteHeadings } from "@/lib/submitCheck";
import { answeredCount, type PacePoint } from "@/lib/pace";
import { pdfText } from "@/lib/pdfText";
import { semester, type Assignment } from "@/lib/semester";

const BUCKET = "assignment-files";

export interface SubmitCheck {
  n: string;
  /** "ok": parts read from the sheet; "notext": a scanned sheet; "none": no sheet uploaded */
  sheet: "ok" | "notext" | "none";
  questions: { q: number; points: number | null; items: PartItem[] }[];
  /** my solution among the synced Notability notes */
  note: {
    id: string;
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
  /** parts with an answer now (my marks, else the detection), and how many there are */
  answered: number;
  total: number;
}

export async function submitState(
  sb: SupabaseClient,
  userId: string,
  code: string,
  n: string,
  assignments: Pick<Assignment, "n" | "type">[],
): Promise<{ check: SubmitCheck; filledQuestions: boolean }> {
  const key = { user_id: userId, course_code: code, semester: semester.semester };
  const [{ data: rows }, { data: notes }, { data: qrows }, { data: crow }] = await Promise.all([
    sb.from("assignment_files").select("id, n, kind, name, path, url, structure").match(key).order("created_at"),
    sb.from("notes").select("id, name, folder, course_code, url, modified_at").match({ user_id: userId, course_code: code }).order("modified_at", { ascending: false }).limit(200),
    sb.from("assignment_questions").select("q").match({ ...key, n }).limit(1),
    sb.from("assignment_checks").select("checks").match({ ...key, n }).maybeSingle(),
  ]);
  const files = (rows ?? []).map((r) => ({ ...r, pdf: !!r.path && /\.pdf$/i.test(r.path) }));

  // the sheet's structure: stored, or read now from its text layer
  const file = sheetFor(files, n);
  let structure = (file?.structure as SheetStructure | null) ?? null;
  const admin = adminClient();
  if (file?.path && !structure && admin) {
    structure = { questions: [] };
    try {
      const { data: blob } = await admin.storage.from(BUCKET).download(file.path);
      if (blob) structure = parseSheet(await pdfText(new Uint8Array(await blob.arrayBuffer()), 40));
    } catch {}
    await sb.from("assignment_files").update({ structure }).match({ id: file.id, user_id: userId });
  }
  // a booklet holds every assignment: its questions can't be told apart, so no parts from it
  const usable = file && file.n === n && isUsable(structure) ? structure : null;
  let filledQuestions = false;
  if (usable && !qrows?.length) {
    const qs = usable.questions.map((x) => ({ ...key, n, q: x.q }));
    const { error } = await sb.from("assignment_questions").upsert(qs, { onConflict: "user_id,course_code,semester,n,q", ignoreDuplicates: true });
    filledQuestions = !error;
  }

  const found = findSolutionNote(notes ?? [], code, solutionNumbers(assignments, n));
  let note: SubmitCheck["note"] = null;
  let headings: NoteHeadings | null = null;
  if (found) {
    const { data: t } = await sb.from("notes").select("text_content, headings, headings_for, headings_error").match({ id: found.id, user_id: userId }).maybeSingle();
    const text = (t?.text_content as string | null) ?? "";
    const at = (t?.headings_for as string | null) ?? null;
    const current = !!at && !!found.modified_at && new Date(at).getTime() >= new Date(found.modified_at).getTime();
    const detect: NonNullable<SubmitCheck["note"]>["detect"] = !at && !t?.headings_error ? "off" : !current ? "stale" : t?.headings_error ? "error" : "ok";
    note = {
      id: found.id,
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
  const questions = (usable?.questions ?? []).map((x) => ({ q: x.q, points: x.points, items: partItems(x) }));
  const itemKeys = questions.flatMap((q) => q.items.map((i) => i.key));
  const foundKeys = new Set(headings?.keys ?? []);
  const emptyKeys = new Set(headings?.empty ?? []);
  const detected = itemKeys.filter((k) => detectedIn(foundKeys, k));
  const emptyParts = itemKeys.filter((k) => !detected.includes(k) && detectedIn(emptyKeys, k));

  return {
    filledQuestions,
    check: {
      n,
      sheet: !file ? "none" : usable ? "ok" : "notext",
      questions,
      note,
      detected,
      emptyParts,
      answer: answerFor(files, n)?.name ?? null,
      answered: answeredCount(itemKeys, detected, (crow?.checks as string[] | undefined) ?? []),
      total: itemKeys.length,
    },
  };
}

/** Adds a point to the assignment's timeline when the count changed (never for a sheet without parts). */
export async function recordPace(sb: SupabaseClient, userId: string, code: string, n: string, answered: number, total: number) {
  if (total <= 0) return;
  const key = { user_id: userId, course_code: code, semester: semester.semester, n };
  const { data: last } = await sb.from("assignment_pace").select("answered, total").match(key).order("at", { ascending: false }).limit(1).maybeSingle();
  if (last && last.answered === answered && last.total === total) return;
  await sb.from("assignment_pace").insert({ ...key, answered, total });
}

/** The timeline of a course's assignments, oldest first, by assignment number. */
export async function paceLog(sb: SupabaseClient, code: string): Promise<Record<string, PacePoint[]>> {
  const { data, error } = await sb.from("assignment_pace").select("n, at, answered, total").match({ course_code: code, semester: semester.semester }).order("at");
  if (error) return {};
  const out: Record<string, PacePoint[]> = {};
  for (const r of data ?? []) (out[r.n as string] ??= []).push({ at: r.at as string, answered: r.answered as number, total: r.total as number });
  return out;
}
