/** Loaders for the ממ"ן tracker (empty before migration 0021 or when signed out). */
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { semester } from "@/lib/semester";
import type { QStatus } from "@/lib/tracker";

/** Questions per assignment number: [{ q, status }]. */
export async function getQuestions(code: string): Promise<Record<string, { q: number; status: QStatus }[]>> {
  if (!supabaseEnabled) return {};
  const sb = await createClient();
  const { data, error } = await sb.from("assignment_questions").select("n, q, status").match({ course_code: code, semester: semester.semester }).order("q");
  if (error) return {};
  const out: Record<string, { q: number; status: QStatus }[]> = {};
  for (const r of data ?? []) (out[r.n] ??= []).push({ q: r.q, status: r.status as QStatus });
  return out;
}

export async function getChecks(code: string): Promise<Record<string, string[]>> {
  if (!supabaseEnabled) return {};
  const sb = await createClient();
  const { data, error } = await sb.from("assignment_checks").select("n, checks").match({ course_code: code, semester: semester.semester });
  if (error) return {};
  return Object.fromEntries((data ?? []).map((r) => [r.n, (r.checks as string[]) ?? []]));
}

