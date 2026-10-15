import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { DeadlineList, type DeadlineRowData } from "@/components/DeadlineList";
import { standingSentence, WeightBar } from "@/components/CourseParts";
import { getProgress, progressKey, standing } from "@/lib/progress";
import { supabaseEnabled } from "@/lib/supabase/config";
import {
  allDeadlines,
  courseTheme,
  formatHebrewDate,
  relativeDays,
  semester,
  todayInIsrael,
  typeLabel,
  type DeadlineItem,
} from "@/lib/semester";

export default function TodayPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Today />
    </Suspense>
  );
}

function Skeleton() {
  return (
    <div aria-hidden className="space-y-6">
      <div className="h-24 w-64 animate-pulse rounded-xl bg-rule" />
      <div className="h-72 animate-pulse rounded-xl bg-rule/60" />
    </div>
  );
}

const WINDOW_DAYS = 14;

function toRow(d: DeadlineItem): DeadlineRowData {
  const theme = courseTheme[d.course.code];
  return {
    key: progressKey(d.course.code, d.n),
    code: d.course.code,
    n: d.n,
    title: `${typeLabel[d.type]} ${d.n} ב${theme.short}`,
    color: theme.color,
    dateLabel: formatHebrewDate(d.due, { day: "numeric", month: "numeric" }),
    weekday: formatHebrewDate(d.due, { weekday: "short" }),
    weight: d.weight,
    relative: relativeDays(d.daysLeft),
    urgent: d.daysLeft <= 7,
  };
}

async function Today() {
  await connection(); // "today" is computed per request, never at build time
  const today = todayInIsrael();
  const progress = await getProgress();
  const open = allDeadlines(today).filter((d) => {
    const s = progress[progressKey(d.course.code, d.n)]?.status;
    return d.daysLeft >= 0 && s !== "submitted" && s !== "skipped";
  });
  const soon = open.filter((d) => d.daysLeft <= WINDOW_DAYS);
  const later = open.filter((d) => d.daysLeft > WINDOW_DAYS).slice(0, 4);
  const next = open[0];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_auto_1fr] lg:gap-x-10">
      {/* Day header spans both columns */}
      <header className="lg:col-span-2">
        <p className="text-ink-soft">{formatHebrewDate(today, { weekday: "long" })}</p>
        <h1 className="font-display text-[2.75rem] leading-none sm:text-6xl">
          {formatHebrewDate(today, { day: "numeric", month: "long" })}
        </h1>
        {next && (
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-soft">
            ההגשה הבאה היא{" "}
            <span className="font-medium text-ink">
              {typeLabel[next.type]} {next.n} ב{courseTheme[next.course.code].short}
            </span>
            ,{" "}
            <span className={next.daysLeft <= 7 ? "hl font-medium" : "font-medium text-ink"}>
              {relativeDays(next.daysLeft)}
            </span>
            .
          </p>
        )}
      </header>

      <section aria-labelledby="soon-title" className="min-w-0 lg:col-start-1">
        <h2 id="soon-title" className="mb-3 text-lg font-semibold">
          בשבועיים הקרובים
        </h2>
        <div className="panel overflow-hidden">
          <DeadlineList
            rows={soon.map(toRow)}
            editable={supabaseEnabled}
            empty={
              next ? (
                <>אין הגשות בשבועיים הקרובים. זמן טוב להתקדם בחומר.</>
              ) : (
                <>כל המטלות של הסמסטר מאחוריך.</>
              )
            }
          />
        </div>

      </section>

      <section aria-labelledby="courses-title" className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-2">
        <h2 id="courses-title" className="mb-3 text-lg font-semibold">
          מצב בקורסים
        </h2>
        <ul className="space-y-3">
          {semester.courses.map((c) => {
            const theme = courseTheme[c.code];
            const st = standing(c, progress, today);
            const s = standingSentence(st, c.assignmentWeight.min, c.assignmentWeight.max);
            return (
              <li key={c.code}>
                <Link
                  href={`/courses#c${c.code}`}
                  className="panel block px-4 py-4 transition-colors hover:border-ink-soft"
                >
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: theme.color }} aria-hidden />
                    <span className="font-medium">{c.name}</span>
                  </div>
                  <WeightBar course={c} st={st} color={theme.color} />
                  <p className={`mt-2 text-sm leading-snug ${s.warn ? "" : "text-ink-soft"}`}>
                    <span className={s.warn ? "hl" : undefined}>{s.text}</span>
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      {later.length > 0 && (
        <section aria-labelledby="later-title" className="min-w-0 lg:col-start-1">
            <h2 id="later-title" className="mb-3 text-lg font-semibold">אחר כך</h2>
            <div className="panel overflow-hidden">
              <DeadlineList rows={later.map(toRow)} editable={supabaseEnabled} empty={null} />
            </div>
            <Link
              href="/semester"
              className="mt-3 inline-block text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink"
            >
              כל המטלות בסמסטר
            </Link>
        </section>
      )}
    </div>
  );
}
