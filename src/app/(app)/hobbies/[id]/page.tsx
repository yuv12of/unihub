import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Icon } from "@/components/Icon";
import { HobbyBoard, HobbySettings, LogList, QuickLog, TimeRing } from "@/components/HobbyParts";
import { getHobbies, hobbyStats, KINDS, minutesText } from "@/lib/hobbies";
import { getRoutines } from "@/lib/userdata";
import { describe } from "@/lib/routines";
import { formatHebrewDate, todayInIsrael } from "@/lib/semester";

export default function HobbyPage({ params }: PageProps<"/hobbies/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
      <Hobby params={params} />
    </Suspense>
  );
}

async function Hobby({ params }: Pick<PageProps<"/hobbies/[id]">, "params">) {
  await connection();
  const { id } = await params;
  const today = todayInIsrael();
  const [{ hobbies, items, logs }, routines] = await Promise.all([getHobbies(), getRoutines()]);
  const h = hobbies.find((x) => x.id === id);
  if (!h) notFound();
  const mine = items.filter((i) => i.hobby_id === id);
  const myLogs = logs.filter((l) => l.hobby_id === id);
  const s = hobbyStats(h, logs, today);
  const routine = routines.find((r) => r.id === h.routine_id);
  const max = Math.max(h.weekly_minutes, 30, ...s.weeks.map((w) => w.minutes));
  const doneItems = mine.filter((i) => i.status === "done").length;

  return (
    <article>
      <Link href="/hobbies" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <Icon name="chevronRight" className="size-4" />
        כל התחביבים
      </Link>

      <header className="mt-4 flex flex-wrap items-center gap-5">
        <span className="relative grid place-items-center">
          <TimeRing minutes={s.week} goal={h.weekly_minutes} size={112} />
          <span className="absolute text-5xl" aria-hidden>
            {h.emoji}
          </span>
        </span>
        <div className="min-w-0">
          <p className="text-sm text-ink-soft">{KINDS[h.kind]?.label ?? "תחביב"}{h.archived ? " · בהפסקה" : ""}</p>
          <h1 className="font-display text-4xl leading-tight">{h.title}</h1>
          <p className="mt-1 text-ink-soft">
            <b className="text-ink">{minutesText(s.week)}</b>
            {h.weekly_minutes ? ` מתוך ${minutesText(h.weekly_minutes)}` : ""} השבוע
            {s.streak > 0 ? ` · ${s.streak} ${s.streak === 1 ? "שבוע" : "שבועות"} ברצף` : ""}
          </p>
          {h.why && <p className="mt-2 max-w-xl text-sm italic text-ink-soft">״{h.why}״</p>}
        </div>
      </header>

      <section className="panel mt-6 p-5">
        <QuickLog hobbyId={id} items={mine} />
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="section-title">{KINDS[h.kind]?.items ?? "דברים לעשות"}</h2>
              {mine.length > 0 && (
                <span className="text-sm text-ink-soft">
                  {doneItems} מתוך {mine.length} הושלמו
                </span>
              )}
            </div>
            <div className="mt-3">
              <HobbyBoard hobbyId={id} items={mine} kind={h.kind} />
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="section-title">יומן תרגול</h2>
            <div className="mt-3">
              <LogList logs={myLogs} items={mine} />
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="panel p-5">
            <h2 className="section-title">12 השבועות האחרונים</h2>
            <div className="mt-4 flex h-24 items-end gap-1" role="img" aria-label="דקות תרגול בכל שבוע">
              {s.weeks.map((w, i) => (
                <span
                  key={w.start}
                  className="flex-1 rounded-t-sm"
                  title={`${formatHebrewDate(w.start, { day: "numeric", month: "numeric" })}: ${minutesText(w.minutes)}`}
                  style={{
                    height: `${Math.max(3, (w.minutes / max) * 96)}px`,
                    background: i === s.weeks.length - 1 ? "var(--ink)" : h.weekly_minutes && w.minutes >= h.weekly_minutes ? "color-mix(in srgb, var(--ink) 55%, var(--rule))" : "var(--rule)",
                  }}
                />
              ))}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-soft">סך הכול</dt>
                <dd className="font-semibold">{minutesText(s.total)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">מפגשי תרגול</dt>
                <dd className="font-semibold">{s.sessions}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-ink-soft">בפעם האחרונה</dt>
                <dd className="font-semibold">{s.last ? formatHebrewDate(s.last, { weekday: "long", day: "numeric", month: "numeric" }) : "עוד לא"}</dd>
              </div>
            </dl>
          </section>

          <section className="panel p-5 text-sm">
            <h2 className="section-title">בלוח השנה</h2>
            {routine ? (
              <p className="mt-2">
                {describe(routine)}, בזמן פנוי.{" "}
                <Link href="/semester" className="text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
                  ללוח
                </Link>
                <span className="mt-1 block text-xs text-ink-soft">סימון המופע בלוח כבוצע רושם את הזמן כאן, ורישום כאן מסמן אותו בלוח.</span>
              </p>
            ) : (
              <p className="mt-2 text-ink-soft">לא משובץ. קובעים זמן שבועי בהגדרות למטה והוא יופיע בלוח.</p>
            )}
          </section>

          <section className="panel p-5">
            <h2 className="section-title">הגדרות</h2>
            <div className="mt-3">
              <HobbySettings id={id} weekly={h.weekly_minutes} why={h.why} archived={h.archived} />
            </div>
          </section>
        </aside>
      </div>
    </article>
  );
}
