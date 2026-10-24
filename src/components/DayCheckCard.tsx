import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getCourses } from "@/lib/userdata";
import { addDays, themeOf } from "@/lib/semester";
import { topBlockers, type DayCheck as Check, type Rhythm } from "@/lib/rhythm";
import { DayCheck } from "@/components/DayCheck";

/** From 18:00 (and until 04:00, for yesterday), the end-of-day check on Today. */
export const CHECK_FROM = 18 * 60;
const LATE_UNTIL = 4 * 60;

export async function DayCheckCard({ today, nowMin }: { today: string; nowMin: number }) {
  if (!supabaseEnabled) return null;
  const late = nowMin < LATE_UNTIL;
  if (!late && nowMin < CHECK_FROM) return null;
  const date = late ? addDays(today, -1) : today;
  const sb = await createClient();
  const [checks, prefs, courses] = await Promise.all([
    sb.from("day_checks").select("date, energy, blockers, focus_band").gte("date", addDays(today, -14)).order("date"),
    sb.from("study_prefs").select("rhythm").maybeSingle(),
    getCourses(),
  ]);
  if (checks.error) return null; // table not there yet
  const list = (checks.data ?? []) as Check[];
  const existing = list.find((c) => c.date === date) ?? null;
  const names = Object.fromEntries(courses.map((c) => [c.code, themeOf(courses, c.code).short]));
  return (
    <DayCheck
      date={date}
      dateLabel={late ? "אתמול" : "היום"}
      existing={existing}
      rhythm={(prefs.data?.rhythm as Rhythm | null) ?? null}
      names={names}
      tips={topBlockers(list, today, 3)}
    />
  );
}
