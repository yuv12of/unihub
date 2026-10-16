import { connection } from "next/server";
import { anonClient, bearer, loadPrivate } from "@/lib/privateFeed";
import type { Course } from "@/lib/semester";

/** Guess the course from the Notability subject folder / file name. */
function guessCourse(text: string, courses: Course[]): string | null {
  const t = text.toLowerCase();
  for (const c of courses) {
    const names = [c.code, c.name, c.nameEn ?? "", c.short].map((x) => x.toLowerCase());
    if (names.some((n) => n && t.includes(n))) return c.code;
  }
  const mine = (code: string) => (courses.some((c) => c.code === code) ? code : null);
  if (/אינפי|calculus|infi/.test(t)) return mine("20474");
  if (/לינארית|ליניארית|algebra|לינארי/.test(t)) return mine("20109");
  if (/מבני נתונים|אלגוריתמים|data struct|algorithms|מבנ"ת/.test(t)) return mine("20407");
  return null;
}

/** Receives a Notability note (OCR'd text + Drive link) from the user's Apps Script. */
export async function POST(req: Request) {
  await connection();
  const token = bearer(req);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  let note: Record<string, unknown>;
  try {
    note = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (typeof note.id !== "string" || typeof note.name !== "string")
    return Response.json({ error: "missing fields" }, { status: 400 });
  const priv = await loadPrivate(token);
  const course = guessCourse(`${note.folder ?? ""} ${note.name}`, priv?.courses ?? []);
  const { data, error } = await anonClient().rpc("ingest_note", { p_token: token, p_note: { ...note, course } });
  if (error) return Response.json({ error: "rejected" }, { status: 400 });
  return Response.json({ result: data, course });
}
