import { connection } from "next/server";
import { bookCaller, ownPath, unauthorized } from "@/lib/bookApi";

/** Signed upload URLs (valid 2 hours) for PDFs under the caller's own folder. */
export async function POST(req: Request) {
  await connection();
  const c = await bookCaller(req);
  if (!c) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { paths?: unknown[] };
  const out = [];
  for (const p of (body.paths ?? []).slice(0, 100)) {
    const path = ownPath(c.uid, p);
    if (!path) continue;
    const { data, error } = await c.admin.storage.from("books").createSignedUploadUrl(path, { upsert: true });
    out.push(error ? { path, error: error.message } : { path, url: data.signedUrl });
  }
  return Response.json({ uploads: out });
}
