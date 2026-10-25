import { connection } from "next/server";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { BUCKET, dayLabel, unsign } from "@/lib/meetupShare";
import { israelNow } from "@/lib/privateFeed";
import { defaultShort } from "@/lib/semester";

/**
 * Step 3 of "share to Unihub": the file is uploaded, record it with the meetup. The link from step 1
 * carries everything (signed, 2 hours). Answers plain text, for the Shortcut's notification.
 */
export async function POST(req: Request) {
  await connection();
  const admin = adminClient();
  const p = unsign(new URL(req.url).searchParams.get("t") ?? "");
  if (!admin || !p) return new Response("הקישור פג או לא תקין. שתפו שוב.", { status: 400 });
  const dir = p.path.slice(0, p.path.lastIndexOf("/"));
  const { data: list } = await admin.storage.from(BUCKET).list(dir, { search: p.path.slice(dir.length + 1) });
  const obj = list?.find((o) => `${dir}/${o.name}` === p.path);
  if (!obj) return new Response("הקובץ לא הגיע. שתפו שוב.", { status: 409 });
  const { data: dup } = await admin.from("meetup_files").select("id").match({ user_id: p.uid, path: p.path }).maybeSingle();
  if (!dup) {
    const size = Number((obj.metadata as { size?: number } | null)?.size) || null;
    const { error } = await admin.from("meetup_files").insert({ user_id: p.uid, course_code: p.code, date: p.date, kind: p.kind, name: p.name, path: p.path, size });
    if (error) return new Response(error.message, { status: 500 });
  }
  revalidatePath(`/meetup/${p.code}/${p.date}`);
  revalidatePath("/");
  const { data: uc } = await admin.from("user_courses").select("short, course:courses(name)").match({ user_id: p.uid, course_code: p.code }).limit(1);
  const name = (uc?.[0]?.course as unknown as { name: string } | null)?.name;
  const short = (uc?.[0]?.short as string | null)?.trim() || (name ? defaultShort(name) : p.code);
  return new Response(`נשמר ב־Unihub: ${p.kind === "slides" ? "קבצי מנחה" : "הערות"}, מפגש ${short} ${dayLabel(p.date, israelNow().date)}.`, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
