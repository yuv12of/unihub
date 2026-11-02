import { connection } from "next/server";
import { anonClient, bearer, loadPrivate } from "@/lib/privateFeed";
import { adminClient } from "@/lib/supabase/admin";
import { recordPace, submitState } from "@/lib/submitState";
import { todayInIsrael } from "@/lib/semester";
import { normalizeHeadings } from "@/lib/submitCheck";

/**
 * The headings an AI model found in a solution note, from the user's Apps Script:
 * { id: driveId, modified: ISO, headings: {parts:[…], pages} | null, error?: string }.
 * Stored as part keys only; the model is asked for headings, never for an opinion of the answers.
 */
export async function POST(req: Request) {
  await connection();
  const token = bearer(req);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const modified = typeof body.modified === "string" ? new Date(body.modified) : null;
  if (typeof body.id !== "string" || !modified || Number.isNaN(modified.getTime()))
    return Response.json({ error: "missing fields" }, { status: 400 });
  const error = typeof body.error === "string" && body.error ? body.error : null;
  const headings = error ? null : normalizeHeadings(body.headings);
  const { data, error: rpcError } = await anonClient().rpc("ingest_note_headings", {
    p_token: token,
    p_drive_id: body.id,
    p_modified: modified.toISOString(),
    p_headings: headings,
    p_error: error,
  });
  if (rpcError) return Response.json({ error: "rejected" }, { status: 400 });
  if (data === "stored" && headings) await moveTimeline(token, body.id as string).catch(() => {});
  return Response.json({ result: data, found: headings?.keys.length ?? 0 });
}

/** New headings can change how many parts have answers: a point on that assignment's timeline. */
async function moveTimeline(token: string, driveId: string) {
  const admin = adminClient();
  if (!admin) return;
  const { data: t } = await admin.from("ingest_tokens").select("user_id").eq("token", token).maybeSingle();
  const userId = t?.user_id as string | undefined;
  if (!userId) return;
  const { data: note } = await admin.from("notes").select("id, course_code").match({ user_id: userId, drive_id: driveId }).maybeSingle();
  const priv = note?.course_code ? await loadPrivate(token) : null;
  const course = priv?.courses.find((c) => c.code === note?.course_code);
  if (!note || !course) return;
  const today = todayInIsrael();
  for (const a of course.assignments.filter((x) => x.type === "file" && x.due >= today)) {
    const { check } = await submitState(admin, userId, course.code, a.n, course.assignments);
    // only the assignment this note is the solution of
    if (check.note?.id === note.id) await recordPace(admin, userId, course.code, a.n, check.answered, check.total);
  }
}
