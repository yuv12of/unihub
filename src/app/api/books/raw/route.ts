import { connection } from "next/server";
import { bookCaller, safeName } from "@/lib/bookProcess";

/**
 * A signed upload link (2 hours) for one raw book PDF in the caller's own folder. The PDF goes
 * straight to storage (no size limit from the site), then /api/books/process splits it.
 */
export async function POST(req: Request) {
  await connection();
  const c = await bookCaller(req);
  if (!c) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const path = `${c.uid}/raw/${Date.now().toString(36)}-${safeName(String(body.name ?? "book").replace(/\.pdf$/i, ""))}.pdf`;
  const { data, error } = await c.admin.storage.from("books").createSignedUploadUrl(path, { upsert: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ path, url: data.signedUrl });
}
