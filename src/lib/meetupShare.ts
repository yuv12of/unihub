import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, defaultShort, semester } from "@/lib/semester";
import { FILES_ASK_DAYS, MEETUP_FILE_KINDS, guessCourse, pickMeetup, type MeetupFileKind } from "@/lib/meetupFiles";
import { israelNow } from "@/lib/privateFeed";

/**
 * "Share to Unihub" (iPad Shortcut from Notability's share sheet, or the PWA share target): which
 * meetup a file goes to, the signed upload link, and a signed "done" link that records it.
 */

export const BUCKET = "meetup-files";

const key = () => createHmac("sha256", "unihub-share").update(process.env.SUPABASE_SECRET_KEY ?? "").digest();

export interface Pending {
  uid: string;
  code: string;
  date: string;
  kind: MeetupFileKind;
  name: string;
  path: string;
  exp: number;
}

export function sign(p: Pending) {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${body}.${createHmac("sha256", key()).update(body).digest("base64url")}`;
}

export function unsign(t: string): Pending | null {
  const [body, mac] = t.split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", key()).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as Pending;
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

export const safeFile = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-80)
    .replace(/^_|_$/g, "") || "file";

/** The user's courses this semester and their recent meetups (admin client: called with a token). */
export async function shareTarget(admin: SupabaseClient, uid: string, fileName: string, courseHint?: string | null) {
  const now = israelNow();
  const [{ data: uc }, { data: ev }] = await Promise.all([
    admin.from("user_courses").select("course_code, short, course:courses(name)").match({ user_id: uid, semester: semester.semester }),
    admin
      .from("user_events")
      .select("course_code, date, start_time, end_time, cancelled")
      .match({ user_id: uid, kind: "tutorial" })
      .gte("date", addDays(now.date, -FILES_ASK_DAYS))
      .lte("date", now.date),
  ]);
  const courses = (uc ?? []).map((r) => {
    const name = (r.course as unknown as { name: string } | null)?.name ?? r.course_code;
    return { code: r.course_code as string, name, short: (r.short as string | null)?.trim() || defaultShort(name) };
  });
  const hint = (courseHint ?? "").trim();
  const course = (hint && courses.find((c) => c.code === hint || c.short === hint || c.name === hint)?.code) || guessCourse(fileName, courses);
  const meetups = (ev ?? []).filter((e) => !e.cancelled && e.course_code && courses.some((c) => c.code === e.course_code)) as {
    course_code: string;
    date: string;
    start_time: string | null;
    end_time: string | null;
  }[];
  const meetup = pickMeetup(meetups, now.date, now.minutes, addDays, course);
  const short = meetup ? courses.find((c) => c.code === meetup.course_code)!.short : null;
  return { meetup, short, courses };
}

export const fileKind = (k: string | null | undefined): MeetupFileKind =>
  MEETUP_FILE_KINDS.includes(k as MeetupFileKind) && k !== "recording" ? (k as MeetupFileKind) : "notes";

export const dayLabel = (date: string, today: string) =>
  date === today ? "היום" : date === addDays(today, -1) ? "אתמול" : new Date(date + "T12:00:00Z").toLocaleDateString("he-IL", { day: "numeric", month: "numeric", timeZone: "UTC" });
