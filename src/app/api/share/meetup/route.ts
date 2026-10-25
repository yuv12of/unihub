import { connection } from "next/server";
import { bookCaller } from "@/lib/bookProcess";
import { BUCKET, dayLabel, fileKind, safeFile, shareTarget, sign } from "@/lib/meetupShare";
import { israelNow } from "@/lib/privateFeed";

/**
 * Step 1 of "share to Unihub" (the iPad Shortcut): which meetup the file goes to, a signed upload
 * link (PUT the file there) and a signed link to POST when the upload is done.
 * Auth: Authorization: Bearer <the Google-connection key from Settings>, or the signed-in session.
 * Input (query or JSON): name (file name), course (optional: number or short name), kind (notes|slides).
 */
export async function POST(req: Request) {
  await connection();
  const c = await bookCaller(req);
  if (!c) return Response.json({ error: "צריך מפתח תקין (הגדרות ← חיבור ל־Google)" }, { status: 401 });
  const url = new URL(req.url);
  const body = (await req.json().catch(() => ({}))) as { name?: string; course?: string; kind?: string };
  const name = String(body.name ?? url.searchParams.get("name") ?? "הערות").trim().slice(0, 200) || "הערות";
  const kind = fileKind(body.kind ?? url.searchParams.get("kind"));
  const { meetup, short } = await shareTarget(c.admin, c.uid, name, body.course ?? url.searchParams.get("course"));
  if (!meetup) return Response.json({ error: "לא נמצא מפגש בשבוע האחרון. אפשר להעלות מעמוד המפגש." }, { status: 404 });

  const file = /\.[a-z0-9]{2,5}$/i.test(name) ? name : `${name}.pdf`;
  const path = `${c.uid}/${meetup.course_code}/${meetup.date}/${Date.now().toString(36)}-${safeFile(file)}`;
  const { data, error } = await c.admin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const t = sign({ uid: c.uid, code: meetup.course_code, date: meetup.date, kind, name: file, path, exp: Date.now() + 2 * 3600_000 });
  return Response.json({
    upload: data.signedUrl,
    finish: `${url.origin}/api/share/meetup/done?t=${t}`,
    course: meetup.course_code,
    date: meetup.date,
    message: `${kind === "slides" ? "קבצי מנחה" : "הערות"} למפגש ב${short}, ${dayLabel(meetup.date, israelNow().date)}`,
  });
}
