import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { getDocumentProxy } from "unpdf";
import { bearer } from "@/lib/privateFeed";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnabled } from "@/lib/supabase/config";

/** Who is calling a book endpoint: the signed-in user (cookie) or an Apps Script token. */
export async function bookCaller(req: Request): Promise<{ admin: SupabaseClient; uid: string } | null> {
  const admin = adminClient();
  if (!admin || !supabaseEnabled) return null;
  const token = bearer(req);
  if (token) {
    const { data } = await admin.from("ingest_tokens").select("user_id").eq("token", token).maybeSingle();
    return data ? { admin, uid: data.user_id as string } : null;
  }
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const uid = data?.claims?.sub as string | undefined;
  return uid ? { admin, uid } : null;
}

export const safeName = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80)
    .replace(/^_|_$/g, "") || "book";

type Doc = Awaited<ReturnType<typeof getDocumentProxy>>;
interface OutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineItem[];
}

async function pageOf(doc: Doc, dest: OutlineItem["dest"]): Promise<number | null> {
  try {
    const d = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(d) || !d.length) return null;
    const ref = d[0];
    const idx = typeof ref === "number" ? ref : await doc.getPageIndex(ref as Parameters<Doc["getPageIndex"]>[0]);
    return idx + 1;
  } catch {
    return null;
  }
}

const tidy = (t: string) => t.replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "").slice(0, 200) || "פרק";

/** Chapters as [title, first page, last page] (1-based, inclusive), from the book's own outline. */
export async function chaptersOf(doc: Doc, chunk = 30): Promise<[string, number, number][]> {
  const n = doc.numPages;
  const outline = ((await doc.getOutline()) ?? []) as OutlineItem[];
  const resolve = async (items: OutlineItem[]) => {
    const out: [string, number][] = [];
    for (const it of items) {
      const p = await pageOf(doc, it.dest);
      if (p && p >= 1 && p <= n) out.push([tidy(it.title), p]);
    }
    return out.sort((a, b) => a[1] - b[1]);
  };
  let tops = await resolve(outline);
  // One wrapper entry (the book's title) or a huge flat list: try the next level down.
  if (tops.length < 2 && outline.length === 1) tops = await resolve(outline[0].items ?? []);
  if (tops.length > 40) tops = [];
  if (tops.length < 2)
    return Array.from({ length: Math.ceil(n / chunk) }, (_, i) => {
      const s = i * chunk + 1;
      const e = Math.min(n, s + chunk - 1);
      return [`חלק ${i + 1} (עמ׳ ${s}–${e})`, s, e] as [string, number, number];
    });
  const out: [string, number, number][] = [];
  if (tops[0][1] > 1) out.push(["פתח דבר ותוכן", 1, tops[0][1] - 1]);
  tops.forEach(([t, p], i) => {
    const end = i + 1 < tops.length ? tops[i + 1][1] - 1 : n;
    if (end >= p) out.push([t, p, end]);
  });
  return out;
}

/**
 * Text of one page in reading order. PDFs store Hebrew either logically or visually reversed;
 * a line whose Hebrew words read backwards (final letters at the start of words) gets flipped.
 */
async function pageText(doc: Doc, n: number): Promise<string> {
  const page = await doc.getPage(n);
  const tc = await page.getTextContent();
  const lines: { y: number; parts: { x: number; s: string }[] }[] = [];
  for (const it of tc.items as { str?: string; transform?: number[]; hasEOL?: boolean }[]) {
    if (!it.str || !it.transform) continue;
    const x = it.transform[4];
    const y = Math.round(it.transform[5]);
    let line = lines.find((l) => Math.abs(l.y - y) <= 2);
    if (!line) lines.push((line = { y, parts: [] }));
    line.parts.push({ x, s: it.str });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines
    .map((l) => {
      const heb = l.parts.filter((p) => /[֐-׿]/.test(p.s)).length > l.parts.length / 2;
      // Hebrew lines run right to left: order the pieces by x descending.
      const parts = [...l.parts].sort((a, b) => (heb ? b.x - a.x : a.x - b.x)).map((p) => p.s);
      let s = parts.join(heb ? " " : " ").replace(/\s+/g, " ").trim();
      if (heb && looksReversed(s)) s = [...s].reverse().join("");
      return s;
    })
    .filter(Boolean)
    .join("\n");
}

/** Final letters (ך ם ן ף ץ) belong at the end of words; at the start, the text is reversed. */
function looksReversed(s: string) {
  const words = s.split(/\s+/).filter((w) => /^[א-ת]{2,}$/.test(w));
  if (words.length < 3) return false;
  const finals = /[ךםןףץ]/;
  const atStart = words.filter((w) => finals.test(w[0])).length;
  const atEnd = words.filter((w) => finals.test(w[w.length - 1])).length;
  return atStart > atEnd;
}

/**
 * Turns an uploaded raw PDF into chapters: splits it along its own table of contents, stores each
 * chapter in the user's private folder, registers the book, and saves the text for search,
 * summaries and practice questions. The raw upload is removed afterwards.
 */
export async function processBook(
  admin: SupabaseClient,
  uid: string,
  rawPath: string,
  course: string,
  title: string,
  position = 0,
): Promise<{ book: string; chapters: number; pages: number; chars: number }> {
  const { data: blob, error } = await admin.storage.from("books").download(rawPath);
  if (error || !blob) throw new Error("הקובץ לא נמצא");
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const doc = await getDocumentProxy(bytes.slice());
  const parts = await chaptersOf(doc);
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });

  const slug = `${safeName(course)}-${Date.now().toString(36)}`;
  const rows: Record<string, unknown>[] = [];
  const texts: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const [t, s, e] = parts[i];
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, Array.from({ length: e - s + 1 }, (_, k) => s - 1 + k));
    copied.forEach((p) => out.addPage(p));
    const file = await out.save({ useObjectStreams: true });
    const path = `${uid}/books/${slug}/${String(i).padStart(2, "0")}.pdf`;
    const up = await admin.storage.from("books").upload(path, file, { contentType: "application/pdf", upsert: true });
    if (up.error) throw new Error(`העלאת פרק ${i + 1} נכשלה`);
    const pageTexts: string[] = [];
    for (let p = s; p <= e; p++) pageTexts.push(await pageText(doc, p).catch(() => ""));
    texts.push(pageTexts.join("\f"));
    rows.push({ idx: i, title: t, start_page: s, end_page: e, storage_path: path, user_id: uid });
  }

  // Re-importing the same title for the course replaces it, keeping reading progress by chapter title.
  const { data: old } = await admin.from("books").select("id").eq("user_id", uid).eq("course_code", course).eq("title", title);
  const keep = new Map<string, Record<string, unknown>>();
  if (old?.length) {
    const { data: prev } = await admin.from("book_chapters").select("title, last_page, read_at, done_at, storage_path").in("book_id", old.map((o) => o.id));
    for (const p of prev ?? []) keep.set(p.title, p);
    await admin.from("books").delete().in("id", old.map((o) => o.id));
    const stale = (prev ?? []).map((p) => p.storage_path).filter(Boolean);
    if (stale.length) await admin.storage.from("books").remove(stale);
  }

  const { data: book, error: e1 } = await admin
    .from("books")
    .insert({ user_id: uid, course_code: course, title: title.slice(0, 200), source_path: rawPath, pages: doc.numPages, position })
    .select("id")
    .single();
  if (e1 || !book) throw new Error("שמירת הספר נכשלה");
  const { error: e2 } = await admin.from("book_chapters").insert(
    rows.map((r, i) => {
      const k = keep.get(r.title as string);
      return { ...r, book_id: book.id, text_content: texts[i].slice(0, 1_500_000), last_page: k?.last_page ?? null, read_at: k?.read_at ?? null, done_at: k?.done_at ?? null };
    }),
  );
  if (e2) throw new Error("שמירת הפרקים נכשלה");
  await admin.storage.from("books").remove([rawPath]);
  await doc.cleanup().catch(() => {});
  return { book: book.id, chapters: rows.length, pages: doc.numPages, chars: texts.reduce((n, t) => n + t.length, 0) };
}
