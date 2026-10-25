import { Suspense } from "react";
import { connection } from "next/server";
import { StudyLog } from "@/components/StudyLog";
import { getCourses, getMyProfile } from "@/lib/userdata";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { toEntry, type LogEntry } from "@/lib/studyLog";
import { weekStart } from "@/lib/routines";
import { addDays, themeOf, todayInIsrael } from "@/lib/semester";

/** Every reported study time, a week at a time: change the minutes, move or delete, add what was missed. */
export default function LogPage({ searchParams }: PageProps<"/log">) {
  return (
    <>
      <h1 className="font-display text-4xl">יומן שעות</h1>
      <p className="mt-2 text-ink-soft">כל הזמן שדיווחת, שבוע אחרי שבוע. אפשר לתקן דקות, להעביר יום או קורס, למחוק, ולהוסיף שעות ששכחת לרשום.</p>
      <Suspense fallback={<div className="mt-6 h-96 max-w-3xl animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Log searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Log({ searchParams }: Pick<PageProps<"/log">, "searchParams">) {
  await connection();
  const sp = await searchParams;
  const today = todayInIsrael();
  const thisWeek = weekStart(today);
  const asked = typeof sp.w === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.w) ? weekStart(sp.w) : thisWeek;
  const ws = asked > thisWeek ? thisWeek : asked;
  const [courses, profile] = await Promise.all([getCourses(), getMyProfile()]);
  let entries: LogEntry[] = [];
  if (supabaseEnabled) {
    const sb = await createClient();
    const { data } = await sb
      .from("session_status")
      .select("session_key, status, minutes")
      .eq("status", "done")
      .gte("session_key", ws)
      .lt("session_key", addDays(ws, 7))
      .order("session_key");
    entries = (data ?? []).map(toEntry).filter((e): e is LogEntry => !!e);
  }
  return (
    <StudyLog
      weekStart={ws}
      today={today}
      thisWeek={thisWeek}
      entries={entries}
      courses={courses.map((c) => ({ code: c.code, short: themeOf(courses, c.code).short, color: themeOf(courses, c.code).color }))}
      goal={profile?.weekly_goal_minutes ?? null}
      editable={supabaseEnabled}
    />
  );
}
