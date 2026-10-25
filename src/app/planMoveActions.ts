"use server";
import { revalidatePath } from "next/cache";
import { action, must } from "@/app/guard";
import { addDays, todayInIsrael } from "@/lib/semester";
import type { SessionMove } from "@/lib/planner";

const KEY = /^\d{4}-\d{2}-\d{2}\|(routine|assignment|exam)\|\d{5}\|[\w-]+$/;
/** How far a session can be moved from its planned day. */
const RANGE = 13;

/**
 * Move a planned study session (or change its length), or put it back (null). Stored by session key in
 * study_prefs.moves; moves of sessions more than a week in the past are dropped on the way.
 */
export async function setSessionMove(key: string, move: (Omit<SessionMove, "code"> & { code?: string | null }) | null) {
  return action("setSessionMove", async ({ supabase, userId }) => {
    if (!KEY.test(key)) throw new Error("מפגש לא תקין");
    const today = todayInIsrael();
    if (move) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(move.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(move.start)) throw new Error("זמן לא תקין");
      const planned = key.slice(0, 10);
      if (move.date < today) throw new Error("אפשר להזיז רק להיום או לימים הבאים");
      if (move.date < addDays(planned, -RANGE) || move.date > addDays(planned, RANGE)) throw new Error(`אפשר להזיז עד שבועיים מהיום המקורי`);
      const m = Math.round(Number(move.minutes));
      if (!Number.isFinite(m) || m < 15 || m > 360) throw new Error("אורך בין רבע שעה ל־6 שעות");
      const [h, mm] = move.start.split(":").map(Number);
      if (h * 60 + mm + m > 24 * 60) throw new Error("המפגש צריך להסתיים עד חצות");
    }
    const { data } = await supabase.from("study_prefs").select("moves").eq("user_id", userId).maybeSingle();
    if (!data) throw new Error("קודם צריך לשמור זמני לימוד בהגדרות");
    const moves: Record<string, SessionMove> = { ...((data.moves as Record<string, SessionMove> | null) ?? {}) };
    if (move) {
      // code: a course → study it here; null → back to the planned course; left out → keep what was set
      const planned = key.split("|")[2];
      let code = move.code === undefined ? moves[key]?.code : move.code;
      if (code === planned) code = undefined;
      if (code) {
        if (!/^\d{5}$/.test(code)) throw new Error("קורס לא תקין");
        const { data: mine } = await supabase.from("user_courses").select("course_code").eq("user_id", userId).eq("course_code", code).limit(1);
        if (!mine?.length) throw new Error("הקורס הזה לא ברשימת הקורסים שלך");
      }
      moves[key] = { date: move.date, start: move.start, minutes: Math.round(Number(move.minutes)), ...(code ? { code } : {}) };
    } else delete moves[key];
    for (const k of Object.keys(moves)) if (k.slice(0, 10) < addDays(today, -7) && moves[k].date < today) delete moves[k];
    must(await supabase.from("study_prefs").update({ moves }).eq("user_id", userId));
    revalidatePath("/", "layout");
  });
}
