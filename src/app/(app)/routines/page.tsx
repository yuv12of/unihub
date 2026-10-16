import { Suspense } from "react";
import { connection } from "next/server";
import { getNames, getPeople, getUserPlan } from "@/lib/userdata";
import { occurrencesFor } from "@/lib/planfor";
import { getRoutines } from "@/lib/userdata";
import { streak, weekProgress, weekStart } from "@/lib/routines";
import { addDays, todayInIsrael } from "@/lib/semester";
import { RoutinesBoard } from "@/components/RoutinesBoard";

export default function RoutinesPage() {
  return (
    <>
      <h1 className="font-display text-4xl">שגרה</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        שינה, אוכל, ספורט, הרגלים, מטלות בית, תחביבים וזמן עם אנשים שאת/ה אוהב/ת. דברים בשעה קבועה נכנסים ללוח כמו שהם,
        ומטרות גמישות (&quot;3 פעמים בשבוע&quot;) משובצות בזמן הפנוי, מסביב ללימודים.
      </p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Board />
      </Suspense>
    </>
  );
}

async function Board() {
  await connection();
  const today = todayInIsrael();
  const [{ plan, events, allLogs, me, logs, offDays }, all, people] = await Promise.all([getUserPlan(today), getRoutines(), getPeople()]);
  const ws = weekStart(today);
  const mine = all.filter((r) => r.role !== "pending");
  const occ = occurrencesFor({ routines: mine.filter((r) => r.active), logs, events, plan, today, from: ws, to: addDays(ws, 6), offDays });
  const names = await getNames([...all.flatMap((r) => r.members.map((m) => m.user_id)), ...all.map((r) => r.user_id)]);
  return (
    <RoutinesBoard
      me={me ?? ""}
      today={today}
      weekStart={ws}
      routines={all.map((r) => ({
        ...r,
        progress: weekProgress(r, logs, today),
        streak: streak(r, logs, today, offDays),
      }))}
      occurrences={occ}
      logs={allLogs}
      names={names}
      people={people.filter((p) => p.i_follow === "accepted" || p.follows_me === "accepted")}
    />
  );
}
