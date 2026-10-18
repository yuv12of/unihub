import { connection } from "next/server";
import { bookCaller, ownPath, unauthorized } from "@/lib/bookApi";

/** A short-lived download URL for one of the caller's own PDFs (the importer reads raw books). */
export async function POST(req: Request) {
  await connection();
  const c = await bookCaller(req);
  if (!c) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { path?: unknown };
  const path = ownPath(c.uid, body.path);
  if (!path) return Response.json({ error: "bad path" }, { status: 400 });
  const { data, error } = await c.admin.storage.from("books").createSignedUrl(path, 3600);
  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json({ url: data.signedUrl });
}
