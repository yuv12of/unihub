import { connection } from "next/server";
import { bookCaller, unauthorized } from "@/lib/bookApi";

/** Stores one chapter's text (pages separated by form feeds), sent separately to stay under body limits. */
export async function POST(req: Request) {
  await connection();
  const c = await bookCaller(req);
  if (!c) return unauthorized();
  const b = (await req.json().catch(() => null)) as { chapter_id?: string; text?: string } | null;
  if (!b?.chapter_id || typeof b.text !== "string") return Response.json({ error: "missing fields" }, { status: 400 });
  const { error, count } = await c.admin
    .from("book_chapters")
    .update({ text_content: b.text.slice(0, 1_500_000) }, { count: "exact" })
    .eq("id", b.chapter_id)
    .eq("user_id", c.uid);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ updated: count });
}
