import { connection } from "next/server";
import { revalidatePath } from "next/cache";
import { bookCaller } from "@/lib/bookProcess";
import { BUCKET, safeFile, shareTarget } from "@/lib/meetupShare";
import { meetupHref } from "@/lib/meetup";

/** Up to Vercel's request body limit; bigger files go through the meetup page or the iPad Shortcut. */
const MAX = 4 * 1024 * 1024;

/**
 * The installed app as a share target (Android / desktop Chrome; manifest share_target): a shared
 * PDF goes to the latest meetup's notes, then the meetup page opens on its files.
 */
export async function POST(req: Request) {
  await connection();
  const back = (path: string) => Response.redirect(new URL(path, req.url), 303);
  const c = await bookCaller(req);
  if (!c) return back("/login");
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return back("/?share=empty");
  const { meetup } = await shareTarget(c.admin, c.uid, files[0].name, null);
  if (!meetup) return back("/?share=nomeetup");
  for (const f of files.slice(0, 5)) {
    if (f.size > MAX) return back(`${meetupHref(meetup.course_code, meetup.date)}?share=big#files`);
    const path = `${c.uid}/${meetup.course_code}/${meetup.date}/${Date.now().toString(36)}-${safeFile(f.name)}`;
    const up = await c.admin.storage.from(BUCKET).upload(path, f, { contentType: f.type || "application/pdf", upsert: true });
    if (up.error) return back(`${meetupHref(meetup.course_code, meetup.date)}?share=failed#files`);
    await c.admin.from("meetup_files").insert({ user_id: c.uid, course_code: meetup.course_code, date: meetup.date, kind: "notes", name: f.name.slice(0, 200) || "הערות", path, size: f.size });
  }
  revalidatePath(`/meetup/${meetup.course_code}/${meetup.date}`);
  return back(`${meetupHref(meetup.course_code, meetup.date)}#files`);
}
