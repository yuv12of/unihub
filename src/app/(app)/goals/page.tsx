import { Suspense } from "react";
import { connection } from "next/server";
import { GoalBoard, GoalNew, TaskList, type GoalCard } from "@/components/GoalParts";
import { AREAS, WIP_LIMIT, colorVar, getGoals, movedSince, nextStep, progressAt, progressText, spark, stalledDays } from "@/lib/goals";
import { weekStart } from "@/lib/routines";
import { daysBetween, relativeDays, todayInIsrael } from "@/lib/semester";

export default function GoalsPage() {
  return (
    <>
      <h1 className="font-display text-4xl">מטרות</h1>
      <Suspense fallback={<div className="mt-8 h-72 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Board />
      </Suspense>
    </>
  );
}

async function Board() {
  await connection();
  const today = todayInIsrael();
  const data = await getGoals();
  const shown = data.goals.filter((g) => g.status !== "dropped");
  const cards: GoalCard[] = shown.map((g) => {
    const next = nextStep(g, data);
    return {
      id: g.id,
      title: g.title,
      color: g.color,
      status: g.status,
      area: AREAS[g.area] ?? "",
      p: progressAt(g, data, today),
      line: progressText(g, data, today),
      due: g.due && g.status !== "done" ? relativeDays(daysBetween(today, g.due)) : null,
      spark: spark(g, data, today),
      next: next?.title ?? null,
      stalled: stalledDays(g, data, today),
    };
  });
  const active = shown.filter((g) => g.status === "active");
  const moved = active.filter((g) => movedSince(g, data, weekStart(today))).length;
  const loose = data.tasks.filter((t) => !t.goal_id && (!t.done_at || t.done_at.slice(0, 10) >= today));

  return (
    <div className="mt-5 space-y-8">
      {active.length > 0 && (
        <section className="panel max-w-2xl p-4 sm:p-5" aria-labelledby="week-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="week-title" className="text-sm text-ink-soft">
              השבוע
            </h2>
            <p className="text-sm font-medium">
              <span className="hl">
                {moved} מתוך {active.length}
              </span>{" "}
              מטרות התקדמו
            </p>
          </div>
          <ul className="mt-3 space-y-2">
            {active.map((g) => {
              const p = Math.round(progressAt(g, data, today) * 100);
              return (
                <li key={g.id} className="flex items-center gap-3 text-xs">
                  <span className="w-28 shrink-0 truncate text-ink-soft sm:w-40">{g.title}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-rule" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={g.title}>
                    <span className="block h-full rounded-full" style={{ width: `${p}%`, background: colorVar(g.color) }} />
                  </span>
                  <span className="w-9 shrink-0 text-end tabular-nums">{p}%</span>
                </li>
              );
            })}
          </ul>
          {active.length > WIP_LIMIT && <p className="mt-3 text-xs text-ink-soft">{active.length} מטרות במקביל זה הרבה. להשהות אחת יכול לעזור לשאר להתקדם.</p>}
        </section>
      )}

      <GoalNew startOpen={shown.length === 0} />

      {shown.length > 0 && <GoalBoard cards={cards} />}

      <section className="max-w-2xl" aria-labelledby="loose-title">
        <h2 id="loose-title" className="section-title">
          משימות בלי מטרה
        </h2>
        <p className="mb-2 text-sm text-ink-soft">דברים קטנים שצריך לזכור, בלי פרויקט מסביב.</p>
        <TaskList goalId={null} tasks={loose} today={today} />
      </section>
    </div>
  );
}
