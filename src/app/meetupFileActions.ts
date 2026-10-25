"use server";
import { revalidatePath } from "next/cache";
import { action, must } from "@/app/guard";
import { adminClient } from "@/lib/supabase/admin";
import { MEETUP_FILE_KINDS, MEETUP_FILE_MAX, type MeetupFileKind } from "@/lib/meetupFiles";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^\d{5}$/;
const BUCKET = "meetup-files";

function check(code: string, date: string, kind?: string) {
  if (!CODE.test(code) || !DATE.test(date)) throw new Error("מפגש לא תקין");
  if (kind !== undefined && !MEETUP_FILE_KINDS.includes(kind as MeetupFileKind)) throw new Error("סוג קובץ לא תקין");
}

function admin() {
  const a = adminClient();
  if (!a) throw new Error("העלאת קבצים לא מוגדרת באתר (חסר מפתח שרת)");
  return a;
}

const safeName = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-80)
    .replace(/^_|_$/g, "") || "file";

const refresh = (code: string, date: string) => {
  revalidatePath(`/meetup/${code}/${date}`);
  revalidatePath(`/courses/${code}`);
  revalidatePath("/");
};

/** A signed upload link (2 hours) in the user's own folder for this meetup. The file goes straight to storage. */
export async function meetupUploadUrl(code: string, date: string, name: string, size: number) {
  return action("meetupUploadUrl", async ({ userId }) => {
    check(code, date);
    if (!Number.isFinite(size) || size <= 0) throw new Error("קובץ ריק");
    if (size > MEETUP_FILE_MAX) throw new Error("הקובץ גדול מ־50MB");
    const path = `${userId}/${code}/${date}/${Date.now().toString(36)}-${safeName(String(name ?? "file"))}`;
    const { data, error } = await admin().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error) throw new Error(error.message);
    return { path, url: data.signedUrl };
  });
}

/** After the upload finished: record it with the meetup. */
export async function addMeetupFile(code: string, date: string, kind: MeetupFileKind, name: string, path: string, size: number) {
  return action("addMeetupFile", async ({ supabase, userId }) => {
    check(code, date, kind);
    if (kind === "recording") throw new Error("הקלטה נשמרת כקישור");
    if (!path.startsWith(`${userId}/${code}/${date}/`) || path.includes("..")) throw new Error("נתיב לא תקין");
    const title = String(name ?? "").trim().slice(0, 200) || "קובץ";
    const { data, error } = await supabase
      .from("meetup_files")
      .insert({ user_id: userId, course_code: code, date, kind, name: title, path, size: Math.round(size) || null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    refresh(code, date);
    return { id: data.id as string };
  });
}

/** The recording (or any link) for this meetup. */
export async function addMeetupLink(code: string, date: string, url: string, name?: string) {
  return action("addMeetupLink", async ({ supabase, userId }) => {
    check(code, date);
    const u = String(url ?? "").trim();
    if (!/^https:\/\/\S+$/.test(u) || u.length > 1000) throw new Error("צריך קישור שמתחיל ב־https://");
    must(
      await supabase
        .from("meetup_files")
        .insert({ user_id: userId, course_code: code, date, kind: "recording", name: String(name ?? "").trim().slice(0, 200) || "הקלטת המפגש", url: u }),
    );
    refresh(code, date);
  });
}

export async function deleteMeetupFile(id: string) {
  return action("deleteMeetupFile", async ({ supabase }) => {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("קובץ לא תקין");
    // RLS: only the user's own row comes back
    const { data } = await supabase.from("meetup_files").select("course_code, date, path").eq("id", id).maybeSingle();
    if (!data) throw new Error("הקובץ לא נמצא");
    if (data.path) await admin().storage.from(BUCKET).remove([data.path]);
    must(await supabase.from("meetup_files").delete().eq("id", id));
    refresh(data.course_code, data.date);
  });
}

/** "No files for this meetup": the reminder stops asking. */
export async function setMeetupFilesDone(code: string, date: string, done: boolean) {
  return action("setMeetupFilesDone", async ({ supabase, userId }) => {
    check(code, date);
    must(await supabase.from("meetup_notes").upsert({ user_id: userId, course_code: code, date, files_done: done }, { onConflict: "user_id,course_code,date" }));
    refresh(code, date);
  });
}
