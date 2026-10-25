"use server";
import { revalidatePath } from "next/cache";
import { action, must } from "@/app/guard";
import { LOG_BACK_DAYS, logKey, toEntry } from "@/lib/studyLog";
import { addDays, todayInIsrael } from "@/lib/semester";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const refresh = () => {
  revalidatePath("/", "layout");
};

function clean(input: { minutes?: number; date?: string; code?: string | null }) {
  const today = todayInIsrael();
  const out: { minutes?: number; date?: string; code?: string | null } = {};
  if (input.minutes !== undefined) {
    const m = Math.round(Number(input.minutes));
    if (!Number.isFinite(m) || m < 1 || m > 600) throw new Error("כמה דקות? בין 1 ל־600");
    out.minutes = m;
  }
  if (input.date !== undefined) {
    if (!DATE.test(input.date)) throw new Error("תאריך לא תקין");
    if (input.date > today) throw new Error("אי אפשר לרשום שעות לעתיד");
    if (input.date < addDays(today, -LOG_BACK_DAYS)) throw new Error(`אפשר לרשום עד ${LOG_BACK_DAYS} יום אחורה`);
    out.date = input.date;
  }
  if (input.code !== undefined) out.code = input.code && /^\d{5}$/.test(input.code) ? input.code : null;
  return out;
}

/** Hours you forgot to report: any day in the last two months. */
export async function addStudyEntry(input: { date: string; code: string | null; minutes: number }) {
  return action("addStudyEntry", async ({ supabase, userId }) => {
    const v = clean(input);
    const key = logKey(v.date!, v.code ?? null);
    must(await supabase.from("session_status").insert({ user_id: userId, session_key: key, status: "done", minutes: v.minutes, updated_at: new Date().toISOString() }));
    refresh();
    return key;
  });
}

/**
 * Change an entry. Minutes for any entry; date and course only for hand-logged ones (a planned session
 * stays tied to its place in the plan). A move gets a new key, so the old row is replaced.
 */
export async function updateStudyEntry(key: string, patch: { minutes?: number; date?: string; code?: string | null }) {
  return action("updateStudyEntry", async ({ supabase, userId }) => {
    if (typeof key !== "string" || key.length > 300) throw new Error("רישום לא תקין");
    const { data: row } = await supabase.from("session_status").select("session_key, status, minutes").match({ user_id: userId, session_key: key }).maybeSingle();
    const entry = row ? toEntry(row) : null;
    if (!entry) throw new Error("הרישום לא נמצא. אולי כבר נמחק?");
    const v = clean(patch);
    const minutes = v.minutes ?? entry.minutes;
    const moving = entry.movable && ((v.date && v.date !== entry.date) || (v.code !== undefined && v.code !== entry.code));
    if ((v.date && v.date !== entry.date) || (v.code !== undefined && v.code !== entry.code)) {
      if (!entry.movable) throw new Error("מפגש מתוכנן נשאר ביום ובקורס שלו. אפשר לשנות את הדקות, או למחוק ולרשום מחדש.");
    }
    if (moving) {
      const next = logKey(v.date ?? entry.date, v.code !== undefined ? v.code : entry.code);
      must(await supabase.from("session_status").insert({ user_id: userId, session_key: next, status: "done", minutes, updated_at: new Date().toISOString() }));
      must(await supabase.from("session_status").delete().match({ user_id: userId, session_key: key }));
      refresh();
      return next;
    }
    must(await supabase.from("session_status").update({ minutes, updated_at: new Date().toISOString() }).match({ user_id: userId, session_key: key }));
    refresh();
    return key;
  });
}

/** Remove reported time. A planned session simply goes back to "not marked". */
export async function deleteStudyEntry(key: string) {
  return action("deleteStudyEntry", async ({ supabase, userId }) => {
    if (typeof key !== "string" || key.length > 300) throw new Error("רישום לא תקין");
    must(await supabase.from("session_status").delete().match({ user_id: userId, session_key: key, status: "done" }));
    refresh();
  });
}

/** Undo of a delete: the same key and minutes back. */
export async function restoreStudyEntry(key: string, minutes: number) {
  return action("restoreStudyEntry", async ({ supabase, userId }) => {
    if (typeof key !== "string" || key.length > 300 || !toEntry({ session_key: key, status: "done", minutes })) throw new Error("רישום לא תקין");
    const m = Math.max(0, Math.min(600, Math.round(Number(minutes))));
    must(await supabase.from("session_status").upsert({ user_id: userId, session_key: key, status: "done", minutes: m, updated_at: new Date().toISOString() }));
    refresh();
  });
}
