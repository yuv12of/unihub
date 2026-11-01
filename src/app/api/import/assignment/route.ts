import { createHash } from "node:crypto";
import { connection } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { supabaseEnabled } from "@/lib/supabase/config";
import { semester } from "@/lib/semester";
import { ASSIGNMENT_FILE_MAX } from "@/lib/assignmentFiles";

/**
 * Import one assignment file from Opal: a script on the Opal page (where the student is logged in)
 * fetches each assignment's file and POSTs its bytes here. Auth: Authorization: Bearer <a
 * short-lived import token> (table import_tokens, hash only). Query: code, n, name, kind
 * (sheet|answer, default sheet). The same file name for the same assignment isn't stored twice.
 */
const OPAL = "https://opal.openu.ac.il";
const cors = {
  "Access-Control-Allow-Origin": OPAL,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "600",
  Vary: "Origin",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
// Vercel's request limit is 4.5MB; larger files go through the course page
const MAX = Math.min(ASSIGNMENT_FILE_MAX, 4_400_000);

const safeName = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-80)
    .replace(/^_|_$/g, "") || "file";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function POST(req: Request) {
  await connection();
  const admin = adminClient();
  if (!admin || !supabaseEnabled) return json({ error: "לא מוגדר" }, 503);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!/^[0-9a-f]{32,128}$/.test(token)) return json({ error: "מפתח ייבוא חסר" }, 401);
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: t } = await admin.from("import_tokens").select("user_id, expires_at").eq("token_hash", hash).maybeSingle();
  if (!t || new Date(t.expires_at as string).getTime() < Date.now()) return json({ error: "מפתח הייבוא פג תוקף" }, 401);
  const uid = t.user_id as string;

  const q = new URL(req.url).searchParams;
  const code = q.get("code") ?? "";
  const n = q.get("n") ?? "";
  const kind = q.get("kind") === "answer" ? "answer" : "sheet";
  const name = (q.get("name") ?? "").replace(/[‎‏‪-‮]/g, "").trim().slice(0, 200);
  if (!/^\d{5}$/.test(code) || !/^(\d{1,3}|all)$/.test(n) || !name) return json({ error: "פרטי מטלה חסרים" }, 400);

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return json({ error: "קובץ ריק" }, 400);
  if (bytes.length > MAX) return json({ error: "קובץ גדול מדי לייבוא, מעלים אותו מעמוד הקורס" }, 413);

  const shown = name.replace(/\.pdf$/i, "");
  const { data: dup } = await admin.from("assignment_files").select("id").match({ user_id: uid, course_code: code, semester: semester.semester, n, kind, name: shown }).maybeSingle();
  if (dup) return json({ skipped: true, id: dup.id });

  const path = `${uid}/${code}/${semester.semester}/${Date.now().toString(36)}-${safeName(name)}`;
  const type = req.headers.get("content-type") || (/\.pdf$/i.test(name) ? "application/pdf" : "application/octet-stream");
  const up = await admin.storage.from("assignment-files").upload(path, bytes, { contentType: type, upsert: true });
  if (up.error) return json({ error: up.error.message }, 500);
  const { data, error } = await admin
    .from("assignment_files")
    .insert({ user_id: uid, course_code: code, semester: semester.semester, n, kind, name: shown, path, size: bytes.length })
    .select("id")
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ id: data.id, path });
}
