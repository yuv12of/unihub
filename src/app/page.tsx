import { Suspense } from "react";
import { connection } from "next/server";
import { Timeline } from "@/components/Timeline";
import { UserBadge } from "@/components/UserBadge";
import { AssignmentChecklist } from "@/components/AssignmentChecklist";
import { getProgress, progressKey, standing, type CourseStanding } from "@/lib/progress";
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

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <span className="font-display text-lg tracking-tight">Unihub</span>
        <Suspense fallback={null}>
          <UserBadge />
        </Suspense>
      </header>
      <Suspense fallback={<TodaySkeleton />}>
        <Today />
      </Suspense>
    </main>
  );
}

function TodaySkeleton() {
  return <div className="mt-10 h-40 animate-pulse rounded-xl bg-rule/40" aria-hidden />;
}

async function Today() {
  await connection(); // "today" must be computed per request, not at build time
  const today = todayInIsrael();
  const progress = await getProgress();
  const statusOf = (code: string, n: string) => progress[progressKey(code, n)]?.status ?? "todo";
  const deadlines = allDeadlines(today);
  // Submitted or skipped assignments drop out of "what's next".
  const upcoming = deadlines.filter(
    (d) => d.daysLeft >= 0 && !["submitted", "skipped"].includes(statusOf(d.course.code, d.n)),
  );
  const next = upcoming[0];
  const nextGroup = next ? upcoming.filter((d) => d.due === next.due) : [];
  const soonList = upcoming.slice(0, 8);

  return (
    <>
      {/* The day itself is the headline. */}
      <section className="mt-8">
        <p className="text-ink-soft text-base">
          {formatHebrewDate(today, { weekday: "long" })}
        </p>
        <h1 className="font-display text-5xl leading-[1.05] sm:text-6xl">
          {formatHebrewDate(today, { day: "numeric", month: "long" })}
        </h1>
        {next && (
          <p className="mt-4 max-w-prose text-lg leading-relaxed">
            המטלה הקרובה:{" "}
            <NextSummary items={nextGroup} />, {" "}
            <span className={next.daysLeft <= 7 ? "hl font-medium" : "font-medium"}>
              {relativeDays(next.daysLeft)}
            </span>
            .
          </p>
        )}
      </section>

      <section className="mt-10" aria-labelledby="sem-title">
        <h2 id="sem-title" className="font-display text-xl">
          הסמסטר שלי, {semester.semester}
        </h2>
        <Timeline today={today} />
      </section>

      <section className="mt-10" aria-labelledby="soon-title">
        <h2 id="soon-title" className="font-display text-xl">
          להגשה בקרוב
        </h2>
        <ol className="mt-3 divide-y divide-rule border-y border-rule bg-paper/80">
          {soonList.map((d) => (
            <DeadlineRow key={d.course.code + d.n} d={d} />
          ))}
        </ol>
      </section>

      <section className="mt-10" aria-labelledby="courses-title">
        <h2 id="courses-title" className="font-display text-xl">
          הקורסים
        </h2>
        <div className="mt-3 space-y-6">
          {semester.courses.map((c) => {
            const theme = courseTheme[c.code];
            const st = standing(c, progress, today);
            return (
              <article key={c.code} className="border-s-4 ps-4" style={{ borderColor: theme.color }}>
                <h3 className="text-lg font-semibold leading-snug">
                  {c.name} <span className="text-ink-soft font-normal text-sm">{c.code}</span>
                </h3>
                <p className="text-sm text-ink-soft">
                  מרכז ההוראה: {c.coordinator}. הערכה מסכמת: {c.finalAssessment}.
                </p>
                <WeightBar course={c} st={st} color={theme.color} />
                <StandingText st={st} min={c.assignmentWeight.min} max={c.assignmentWeight.max} />
                {c.rules && (
                  <ul className="mt-2 list-disc ps-5 text-sm text-ink-soft space-y-0.5">
                    {c.rules.map((r) => (
                      <li key={r} dir="auto">
                        {ruleHe[r] ?? r}
                      </li>
                    ))}
                  </ul>
                )}
                <AssignmentChecklist
                  code={c.code}
                  color={theme.color}
                  editable={supabaseEnabled}
                  items={c.assignments.map((a) => ({
                    n: a.n,
                    label: `${typeLabel[a.type]} ${a.n}`,
                    due: formatHebrewDate(a.due, { day: "numeric", month: "numeric" }),
                    weight: a.weight,
                    past: a.due < today,
                    progress: progress[progressKey(c.code, a.n)] ?? { status: "todo", grade: null },
                  }))}
                />
                <p className="mt-2 flex gap-4 text-sm">
                  <a
                    className="underline underline-offset-4 decoration-rule hover:decoration-current"
                    href={`https://opal.openu.ac.il/course/view.php?id=${c.opalId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    אתר הקורס
                  </a>
                  <a
                    className="underline underline-offset-4 decoration-rule hover:decoration-current"
                    href={`https://academic.openu.ac.il/course-requirements/course/${c.code}/semester/${encodeURIComponent(semester.semester)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    דרישות הקורס
                  </a>
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="mt-12 text-xs text-ink-soft leading-relaxed">
        הנתונים נאספו מאופל ומדפי דרישות הקורס ב־15.10.2026. מועדי הבחינות עוד לא פורסמו.
      </footer>
    </>
  );
}

function WeightBar({
  course,
  st,
  color,
}: {
  course: (typeof semester.courses)[number];
  st: CourseStanding;
  color: string;
}) {
  const scale = course.assignmentWeight.max;
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  return (
    <div
      className="relative mt-3 h-3 rounded-full bg-rule/50"
      role="img"
      aria-label={`נצברו ${st.earned} מתוך מינימום ${course.assignmentWeight.min} נקודות משקל`}
    >
      <div className="absolute inset-y-0 start-0 rounded-full" style={{ width: pct(st.earned), background: color }} />
      <div
        className="absolute -inset-y-1 w-0.5 bg-ink"
        style={{ insetInlineStart: pct(course.assignmentWeight.min) }}
        title={`מינימום: ${course.assignmentWeight.min}`}
      />
    </div>
  );
}

function StandingText({ st, min, max }: { st: CourseStanding; min: number; max: number }) {
  let line: React.ReactNode;
  if (st.needed === 0) {
    line = (
      <>
        עברת את המינימום ({st.earned} מתוך {min}). כל מטלה נוספת עד {max} נקודות יכולה רק להעלות את הציון.
      </>
    );
  } else if (st.atRisk) {
    line = (
      <span className="hl">
        חסרות {st.needed} נקודות, אבל נשארו רק {st.open} פתוחות. כדאי לבדוק עם מרכז ההוראה.
      </span>
    );
  } else {
    line = (
      <>
        צברת {st.earned} מתוך {min} נקודות חובה. נשארו {st.open} נקודות פתוחות
        {st.slack > 0 ? `, כך שאפשר לוותר על עד ${st.slack} מהן.` : ", וצריך את כולן."}
      </>
    );
  }
  return (
    <p className="mt-2 text-[15px] leading-relaxed">
      {line}
      {st.average != null && <> ממוצע הציונים במטלות: {st.average}.</>}
    </p>
  );
}

const ruleHe: Record<string, string> = {
  "Must submit at least 3 of 01-05": "חובה להגיש לפחות 3 מהמטלות 01 עד 05.",
  "Zero grades on 01-05 count toward the final grade":
    "ציון אפס במטלות 01 עד 05 נכנס לשקלול ומוריד את הציון הסופי.",
  "06 requires attending the minimum number of tutorials":
    "מטלה 06 ניתנת על השתתפות במספר מינימלי של מפגשי הנחיה.",
  "Assignments may be submitted in pairs": "אפשר להגיש בזוגות.",
};

function NextSummary({ items }: { items: DeadlineItem[] }) {
  return (
    <>
      {items.map((d, i) => (
        <span key={d.course.code + d.n}>
          {i > 0 && (i === items.length - 1 ? " ו" : ", ")}
          {typeLabel[d.type]} {d.n} ב{courseTheme[d.course.code].short}
        </span>
      ))}
    </>
  );
}

function DeadlineRow({ d }: { d: DeadlineItem }) {
  const theme = courseTheme[d.course.code];
  const urgent = d.daysLeft <= 7;
  return (
    <li className="flex items-center gap-3 py-3 px-1">
      <div className="w-12 shrink-0 text-center leading-tight">
        <div className="text-lg font-semibold tabular-nums">
          {formatHebrewDate(d.due, { day: "numeric", month: "numeric" })}
        </div>
        <div className="text-[11px] text-ink-soft">{formatHebrewDate(d.due, { weekday: "short" })}</div>
      </div>
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: theme.color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">
          {typeLabel[d.type]} {d.n} ב{theme.short}
        </div>
        <div className="text-xs text-ink-soft">משקל {d.weight}</div>
      </div>
      <div className={`shrink-0 text-sm ${urgent ? "hl font-semibold" : "text-ink-soft"}`}>
        {relativeDays(d.daysLeft)}
      </div>
    </li>
  );
}
