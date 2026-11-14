import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Icon } from "@/components/Icon";
import { GoalChart } from "@/components/GoalChart";
import { GoalJournal, GoalLogForm, GoalSettings, GoalTime, MilestoneList, TaskList } from "@/components/GoalParts";
import { weekStart } from "@/lib/routines";
import { AREAS, STATUSES, colorVar, currentValue, getGoals, nowMs, goalMinutesSince, notesOf, partsOf, plannedNow, progressAt, progressText, projectedFinish, stalledDays, timeline } from "@/lib/goals";
import { daysBetween, formatHebrewDate, relativeDays, todayInIsrael } from "@/lib/semester";

export default function GoalPage({ params }: PageProps<"/goals/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
      <Goal params={params} />
    </Suspense>
  );
}

async function Goal({ params }: Pick<PageProps<"/goals/[id]">, "params">) {
  await connection();
  const { id } = await params;
  const today = todayInIsrael();
  const now = nowMs();
  const data = await getGoals();
  const g = data.goals.find((x) => x.id === id);
  if (!g) notFound();
  const { tasks, milestones } = partsOf(g, data);
  const color = colorVar(g.color);
  const p = progressAt(g, data, today);
  const planned = plannedNow(g, today);
  const projected = g.status === "active" ? projectedFinish(g, data, today) : null;
  const stalled = stalledDays(g, data, today);
  const day = (iso: string) => formatHebrewDate(iso, { day: "numeric", month: "numeric" });
  const gap = planned == null ? null : Math.round((p - planned) * 100);
  const msDone = milestones.filter((m) => m.done_at).length;

  return (
    <article className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/goals" className="inline-flex min-h-11 items-center gap-1 text-sm text-ink-soft hover:text-ink">
          <Icon name="chevronRight" className="size-4" />
          כל המטרות
        </Link>
        <span className="rounded-md px-2.5 py-1 text-xs font-semibold" style={g.status === "active" ? { background: color, color: "var(--surface)" } : { border: "1px solid var(--rule-strong)" }}>
          {STATUSES[g.status]}
        </span>
      </div>

      <header>
        <h1 className="font-display text-3xl sm:text-4xl">{g.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{[AREAS[g.area], g.due && `יעד ${day(g.due)}`, g.due && g.status !== "done" && relativeDays(daysBetween(today, g.due))].filter(Boolean).join(" · ")}</p>
        {g.description && <p className="mt-3 max-w-prose whitespace-pre-line leading-relaxed">{g.description}</p>}
        {g.why && <p className="mt-2 text-sm text-ink-soft">למה: {g.why}</p>}
      </header>

      {stalled > 0 && (
        <p className="panel px-4 py-3 text-sm">
          <span className="hl">{stalled} ימים בלי תזוזה.</span> מה הצעד הכי קטן שאפשר לעשות היום? אם זה לא הזמן, אפשר להשהות למטה.
        </p>
      )}

      <section className="panel space-y-3 p-4 sm:p-5" aria-labelledby="progress-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="progress-title" className="section-title">
            התקדמות
          </h2>
          {projected ? (
            <p className="text-sm">
              <span className="hl">בקצב הזה: {day(projected)}</span>
              {g.due && <span className="text-ink-soft"> {projected <= g.due ? "לפני היעד" : `${daysBetween(g.due, projected)} ימים אחרי היעד`}</span>}
            </p>
          ) : (
            g.status === "active" && p < 1 && <p className="text-sm text-ink-soft">עוד אין מספיק תזוזה לתחזית</p>
          )}
        </div>
        <GoalChart points={timeline(g, data, now)} now={now} due={g.due} projected={projected} color={color} />
      </section>

      <dl className="grid grid-cols-3 gap-3">
        <div className="panel p-3">
          <dd className="text-2xl font-bold tabular-nums">{Math.round(p * 100)}%</dd>
          <dt className="text-xs text-ink-soft">{progressText(g, data, today)}</dt>
        </div>
        <div className="panel p-3">
          <dd className="text-2xl font-bold tabular-nums" dir="ltr" style={{ textAlign: "start" }}>{gap == null ? "—" : `${gap > 0 ? "+" : ""}${gap}%`}</dd>
          <dt className="text-xs text-ink-soft">{gap == null ? "בלי תאריך יעד" : gap >= 0 ? "מעל הקו המתוכנן" : "מתחת לקו המתוכנן"}</dt>
        </div>
        <div className="panel p-3">
          <dd className="text-2xl font-bold tabular-nums">{milestones.length ? `${msDone}/${milestones.length}` : tasks.filter((t) => !t.done_at).length}</dd>
          <dt className="text-xs text-ink-soft">{milestones.length ? "אבני דרך" : "משימות פתוחות"}</dt>
        </div>
      </dl>

      <section className="panel p-4 sm:p-5" aria-labelledby="journal-title">
        <h2 id="journal-title" className="section-title mb-2">
          יומן התקדמות
        </h2>
        <GoalJournal goalId={g.id} notes={notesOf(g, data).map((n) => ({ id: n.id, date: n.date, body: n.body }))} today={today} />
      </section>

      {(g.progress_mode === "number" || g.progress_mode === "manual") && (
        <section className="panel p-4 sm:p-5" aria-labelledby="log-title">
          <h2 id="log-title" className="section-title mb-2">
            עדכון
          </h2>
          <GoalLogForm goalId={g.id} mode={g.progress_mode} current={g.progress_mode === "number" ? currentValue(g, data, today) : Math.round(p * 100)} unit={g.unit} />
        </section>
      )}

      <section className="panel p-4 sm:p-5" aria-labelledby="ms-title">
        <h2 id="ms-title" className="section-title mb-2">
          אבני דרך
        </h2>
        <MilestoneList goalId={g.id} milestones={milestones} today={today} />
      </section>

      <section className="panel p-4 sm:p-5" aria-labelledby="tasks-title">
        <h2 id="tasks-title" className="section-title mb-2">
          משימות
        </h2>
        <TaskList goalId={g.id} tasks={tasks} today={today} />
      </section>

      <section className="panel p-4 sm:p-5" aria-labelledby="time-title">
        <h2 id="time-title" className="section-title mb-2">
          זמן על המטרה
        </h2>
        <GoalTime goalId={g.id} title={g.title} week={goalMinutesSince(g, data, weekStart(today))} weekly={g.weekly_minutes} total={goalMinutesSince(g, data, "0000-00-00")} scheduled={!!g.routine_id} />
      </section>

      <section className="panel p-4 sm:p-5" aria-labelledby="set-title">
        <h2 id="set-title" className="section-title mb-3">
          הגדרות המטרה
        </h2>
        <GoalSettings id={g.id} status={g.status} due={g.due} why={g.why} description={g.description ?? null} />
      </section>
    </article>
  );
}
