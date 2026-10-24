"use server";
import { revalidatePath } from "next/cache";
import { action, must } from "@/app/guard";
import { semester } from "@/lib/semester";
import type { ActionCtx } from "@/app/guard";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^\d{5}$/;
const check = (code: string, date: string) => {
  if (!CODE.test(code) || !DATE.test(date)) throw new Error("מפגש לא תקין");
};

async function syncFocus({ supabase, userId }: ActionCtx) {
  const { data } = await supabase.from("stuck_points").select("course_code").match({ user_id: userId, resolved: false });
  const focus: Record<string, number> = {};
  for (const r of data ?? []) if (r.course_code) focus[r.course_code] = (focus[r.course_code] ?? 0) + 1;
  await supabase.from("study_prefs").update({ focus }).eq("user_id", userId);
}

/** Autosave of the live notes (called a second after typing stops). */
export async function saveMeetupNote(code: string, date: string, body: string) {
  return action("saveMeetupNote", async ({ supabase, userId }) => {
    check(code, date);
    const text = String(body ?? "").slice(0, 20000);
    must(
      await supabase
        .from("meetup_notes")
        .upsert({ user_id: userId, course_code: code, date, body: text, updated_at: new Date().toISOString() }, { onConflict: "user_id,course_code,date" }),
    );
    return { savedAt: new Date().toISOString() };
  });
}

export async function setMeetupAttended(code: string, date: string, attended: boolean | null) {
  return action("setMeetupAttended", async ({ supabase, userId }) => {
    check(code, date);
    must(await supabase.from("meetup_notes").upsert({ user_id: userId, course_code: code, date, attended }, { onConflict: "user_id,course_code,date" }));
    revalidatePath(`/courses/${code}`);
  });
}

/** A prepared question was raised in the meetup (or un-ticked). */
export async function setMeetupAsked(code: string, date: string, asked: string[]) {
  return action("setMeetupAsked", async ({ supabase, userId }) => {
    check(code, date);
    const ids = [...new Set(asked)].filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 50);
    must(await supabase.from("meetup_notes").upsert({ user_id: userId, course_code: code, date, asked: ids }, { onConflict: "user_id,course_code,date" }));
  });
}

/** The "❓" lines of the notes become stuck points (the planner weights the course, the tutor list shows them). */
export async function meetupQuestionsToStuck(code: string, date: string, lines: string[]) {
  return action("meetupQuestionsToStuck", async (ctx) => {
    check(code, date);
    const clean = [...new Set(lines.map((l) => l.trim().slice(0, 280)).filter(Boolean))].slice(0, 10);
    if (!clean.length) return { added: 0 };
    const { data: open } = await ctx.supabase.from("stuck_points").select("topic").match({ user_id: ctx.userId, course_code: code, resolved: false });
    const have = new Set((open ?? []).map((r) => r.topic));
    const rows = clean.filter((t) => !have.has(t)).map((topic) => ({ user_id: ctx.userId, course_code: code, topic }));
    if (rows.length) must(await ctx.supabase.from("stuck_points").insert(rows));
    await syncFocus(ctx);
    revalidatePath(`/courses/${code}`);
    return { added: rows.length };
  });
}

/** For courses without the links yet (friends, a new semester): paste the meetup link once. */
export async function saveMeetupLinks(code: string, input: { live_url?: string | null; recordings_url?: string | null }) {
  return action("saveMeetupLinks", async ({ supabase, userId }) => {
    if (!CODE.test(code)) throw new Error("קורס לא תקין");
    const url = (u: string | null | undefined) => {
      const v = (u ?? "").trim();
      if (!v) return null;
      if (!/^https:\/\/\S+$/.test(v) || v.length > 500) throw new Error("צריך קישור שמתחיל ב־https://");
      return v;
    };
    const patch: Record<string, string | null> = {};
    if (input.live_url !== undefined) patch.live_url = url(input.live_url);
    if (input.recordings_url !== undefined) patch.recordings_url = url(input.recordings_url);
    must(await supabase.from("user_courses").update(patch).match({ user_id: userId, course_code: code, semester: semester.semester }));
    revalidatePath("/meetup", "layout");
  });
}
