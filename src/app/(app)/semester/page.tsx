import { Suspense } from "react";
import { connection } from "next/server";
import { Timeline } from "@/components/Timeline";
import { getProgress, progressKey } from "@/lib/progress";
import {
  allDeadlines,
  courseTheme,
  formatHebrewDate,
  semester,
  todayInIsrael,
  typeLabel,
} from "@/lib/semester";

export default function SemesterPage() {
  return (
    <>
      <h1 className="font-display text-4xl">סמסטר {semester.semester}</h1>
      <p className="mt-2 text-ink-soft">כל המטלות של הסמסטר לפי שבועות. מועדי הבחינות עוד לא פורסמו.</p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Semester />
      </Suspense>
    </>
  );
}

const statusLabel: Record<string, string> = { submitted: "הוגש", skipped: "ויתור" };

async function Semester() {
  await connection();
  const today = todayInIsrael();
  const progress = await getProgress();
  const all = allDeadlines(today);

  const months = new Map<string, typeof all>();
  for (const d of all) {
    const k = d.due.slice(0, 7);
    if (!months.has(k)) months.set(k, []);
    months.get(k)!.push(d);
  }

  return (
    <>
      <section className="panel mt-8 px-4 py-5 sm:px-6">
        <Timeline today={today} />
      </section>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {[...months].map(([month, items]) => (
          <section key={month} className="panel overflow-hidden">
            <h2 className="border-b border-rule px-5 py-3 font-semibold">
              {formatHebrewDate(month + "-01", { month: "long", year: "numeric" })}
            </h2>
            <ul className="divide-y divide-rule">
              {items.map((d) => {
                const theme = courseTheme[d.course.code];
                const status = progress[progressKey(d.course.code, d.n)]?.status;
                const past = d.daysLeft < 0;
                const done = status === "submitted" || status === "skipped";
                return (
                  <li
                    key={d.course.code + d.n}
                    className={`flex items-center gap-3 px-5 py-2.5 ${done || past ? "text-ink-soft" : ""}`}
                  >
                    <span className="w-10 shrink-0 tabular-nums text-sm">
                      {formatHebrewDate(d.due, { day: "numeric", month: "numeric" })}
                    </span>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: theme.color }} aria-hidden />
                    <span className={`flex-1 truncate ${done ? "line-through" : ""}`}>
                      {typeLabel[d.type]} {d.n} ב{theme.short}
                    </span>
                    {status && statusLabel[status] && <span className="text-xs">{statusLabel[status]}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
