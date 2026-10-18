import { connection } from "next/server";
import { bookCaller, processBook } from "@/lib/bookProcess";

export const maxDuration = 300;

/** Splits an uploaded raw book into chapters and registers it (see lib/bookProcess). */
export async function POST(req: Request) {
  await connection();
  const c = await bookCaller(req);
  if (!c) return Response.json({ error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { path?: string; course?: string; title?: string; position?: number } | null;
  if (!b?.path || !b.course || !b.title) return Response.json({ error: "missing fields" }, { status: 400 });
  if (!b.path.startsWith(`${c.uid}/raw/`) || b.path.includes("..")) return Response.json({ error: "bad path" }, { status: 400 });
  const { data: mine } = await c.admin.from("user_courses").select("course_code").eq("user_id", c.uid).eq("course_code", b.course).limit(1);
  if (!mine?.length) return Response.json({ error: "הקורס לא ברשימת הקורסים שלך" }, { status: 400 });
  try {
    const r = await processBook(c.admin, c.uid, b.path, b.course, String(b.title).trim(), Number(b.position) || 0);
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "processing failed" }, { status: 500 });
  }
}
