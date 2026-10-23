import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { HobbyNew, QuickLog, TimeRing } from "@/components/HobbyParts";
import { getHobbies, hobbyStats, minutesText } from "@/lib/hobbies";
import { todayInIsrael } from "@/lib/semester";

export default function HobbiesPage() {
  return (
    <>
      <h1 className="font-display text-4xl">תחביבים</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        זמן לדברים שעושים בשביל הכיף. לכל תחביב יש זמן שבועי שמשתבץ בלוח, רשימה של מה ללמוד או ליצור, ויומן תרגול.
      </p>
      <Suspense fallback={<div className="mt-8 h-72 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <List />
      </Suspense>
    </>
  );
}

async function List() {
  await connection();
  const today = todayInIsrael();
  const { hobbies, items, logs } = await getHobbies();
  const active = hobbies.filter((h) => !h.archived);
  const paused = hobbies.filter((h) => h.archived);
  return (
    <div className="mt-8 space-y-10">
      {active.length > 0 && (
        <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {active.map((h) => {
            const s = hobbyStats(h, logs, today);
            const next = items.find((i) => i.hobby_id === h.id && i.status === "doing") ?? items.find((i) => i.hobby_id === h.id && i.status === "want");
            return (
              <li key={h.id} className="panel flex flex-col p-5">
                <Link href={`/hobbies/${h.id}`} className="flex items-center gap-4">
                  <span className="relative grid place-items-center">
                    <TimeRing minutes={s.week} goal={h.weekly_minutes} />
                    <span className="absolute text-2xl" aria-hidden>
                      {h.emoji}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xl font-semibold hover:underline">{h.title}</span>
                    <span className="block text-sm text-ink-soft">
                      {minutesText(s.week)}
                      {h.weekly_minutes ? ` מתוך ${minutesText(h.weekly_minutes)}` : ""} השבוע
                    </span>
                    {s.streak > 1 && <span className="block text-xs text-ink-soft">{s.streak} שבועות ברצף</span>}
                  </span>
                </Link>
                {next && (
                  <p className="mt-4 text-sm">
                    <span className="text-ink-soft">{next.status === "doing" ? "עכשיו: " : "הבא: "}</span>
                    {next.title}
                  </p>
                )}
                <div className="mt-auto pt-4">
                  <QuickLog hobbyId={h.id} compact />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section>
        <h2 className="section-title">{active.length ? "תחביב חדש" : "מה עושה לך טוב?"}</h2>
        <div className="mt-3">
          <HobbyNew />
        </div>
      </section>

      {paused.length > 0 && (
        <section>
          <h2 className="section-title">בהפסקה</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {paused.map((h) => (
              <li key={h.id}>
                <Link href={`/hobbies/${h.id}`} className="rounded-full border border-rule px-3 py-1.5 text-sm text-ink-soft hover:border-ink hover:text-ink">
                  {h.emoji} {h.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
