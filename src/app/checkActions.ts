"use server";
import { revalidatePath } from "next/cache";
import { action, must, type ActionCtx } from "@/app/guard";
import { BANDS, BLOCKERS, computeRhythm, type DayCheck, type Rhythm } from "@/lib/rhythm";
import { addDays, semester, todayInIsrael } from "@/lib/semester";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Recompute the learned rhythm from the last six weeks and store it with the study prefs. */
async function relearn({ supabase, userId }: ActionCtx, off?: boolean): Promise<Rhythm | null> {
  const today = todayInIsrael();
  const from = addDays(today, -42);
  const [checks, rows, courses, prefs] = await Promise.all([
    supabase.from("day_checks").select("date, energy, blockers, focus_band").eq("user_id", userId).gte("date", from),
    supabase.from("session_status").select("session_key, status").eq("user_id", userId).gte("session_key", from),
    supabase.from("user_courses").select("course_code").eq("user_id", userId).eq("semester", semester.semester),
    supabase.from("study_prefs").select("focus, rhythm").eq("user_id", userId).maybeSingle(),
  ]);
  if (!prefs.data) return null; // no study settings yet: nothing to plan with
  const rhythm = computeRhythm({
    checks: (checks.data ?? []) as DayCheck[],
    sessionRows: rows.data ?? [],
    courses: (courses.data ?? []).map((c) => c.course_code),
    focus: prefs.data.focus as Record<string, number> | null,
    today,
    off: off ?? !!(prefs.data.rhythm as Rhythm | null)?.off,
  });
  must(await supabase.from("study_prefs").update({ rhythm }).eq("user_id", userId));
  return rhythm;
}

export async function saveDayCheck(input: { date: string; energy: number; blockers: string[]; focusBand: string | null; note?: string }) {
  return action("saveDayCheck", async (ctx) => {
    const today = todayInIsrael();
    if (!DATE.test(input.date) || input.date > today || input.date < addDays(today, -2)) throw new Error("אפשר למלא רק להיום או לאתמול");
    const energy = Math.round(Number(input.energy));
    if (!(energy >= 1 && energy <= 5)) throw new Error("צריך לבחור רמת אנרגיה");
    const ok = new Set(BLOCKERS.map((b) => b.id));
    const blockers = [...new Set((input.blockers ?? []).filter((b) => ok.has(b)))];
    const focus_band = BANDS.some((b) => b.id === input.focusBand) ? input.focusBand : null;
    const note = input.note?.trim().slice(0, 300) || null;
    must(
      await ctx.supabase
        .from("day_checks")
        .upsert({ user_id: ctx.userId, date: input.date, energy, blockers, focus_band, note }, { onConflict: "user_id,date" }),
    );
    const rhythm = await relearn(ctx);
    revalidatePath("/");
    return { rhythm };
  });
}

/** Keep learning, but stop (or start again) moving sessions by it. */
export async function setRhythmOff(off: boolean) {
  return action("setRhythmOff", async (ctx) => {
    const rhythm = await relearn(ctx, off);
    revalidatePath("/");
    return { rhythm };
  });
}
