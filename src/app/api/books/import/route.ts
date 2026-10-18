import { connection } from "next/server";
import { bookCaller, ownPath, unauthorized } from "@/lib/bookApi";

interface ChapterIn {
  idx: number;
  title: string;
  start_page: number;
  end_page: number;
  storage_path: string;
}

/**
 * Registers a book and its chapters (files already uploaded). Re-importing the same source file
 * replaces the old record but keeps reading progress for chapters with the same title.
 */
export async function POST(req: Request) {
  await connection();
  const c = await bookCaller(req);
  if (!c) return unauthorized();
  const b = (await req.json().catch(() => null)) as {
    course_code?: string;
    title?: string;
    source_path?: string;
    pages?: number;
    position?: number;
    chapters?: ChapterIn[];
  } | null;
  if (!b?.course_code || !b.title || !Array.isArray(b.chapters) || !b.chapters.length)
    return Response.json({ error: "missing fields" }, { status: 400 });

  const { admin, uid } = c;
  const source = b.source_path ? ownPath(uid, b.source_path) : null;
  const old = source
    ? (await admin.from("books").select("id").eq("user_id", uid).eq("source_path", source)).data ?? []
    : [];
  const keep = new Map<string, { last_page: number | null; read_at: string | null; done_at: string | null }>();
  if (old.length) {
    const { data: prev } = await admin
      .from("book_chapters")
      .select("title, last_page, read_at, done_at")
      .in("book_id", old.map((o) => o.id));
    for (const p of prev ?? []) keep.set(p.title, p);
    await admin.from("books").delete().in("id", old.map((o) => o.id));
  }

  const { data: book, error } = await admin
    .from("books")
    .insert({ user_id: uid, course_code: b.course_code, title: b.title.slice(0, 200), source_path: source, pages: b.pages ?? 0, position: b.position ?? 0 })
    .select("id")
    .single();
  if (error || !book) return Response.json({ error: error?.message ?? "insert failed" }, { status: 500 });

  const rows = b.chapters.map((ch) => {
    const path = ownPath(uid, ch.storage_path);
    const k = keep.get(ch.title);
    return {
      book_id: book.id,
      user_id: uid,
      idx: ch.idx,
      title: String(ch.title).slice(0, 300),
      start_page: ch.start_page,
      end_page: ch.end_page,
      storage_path: path ?? "",
      last_page: k?.last_page ?? null,
      read_at: k?.read_at ?? null,
      done_at: k?.done_at ?? null,
    };
  });
  if (rows.some((r) => !r.storage_path)) return Response.json({ error: "bad chapter path" }, { status: 400 });
  const { data: chapters, error: e2 } = await admin.from("book_chapters").insert(rows).select("id, idx");
  if (e2) return Response.json({ error: e2.message }, { status: 500 });
  return Response.json({ book: book.id, chapters });
}
