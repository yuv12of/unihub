import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getFriendView } from "@/lib/userdata";
import { summarize } from "@/lib/friends";
import { addDays, daysBetween, formatHebrewDate, relativeDays, todayInIsrael } from "@/lib/semester";
import { minutesLabel } from "@/lib/planner";
import { describe, emojiOf } from "@/lib/routines";
import { Avatar } from "@/components/Avatar";
import { StandingText, WeightBar } from "@/components/CourseParts";

export default function FriendPage({ params }: PageProps<"/friends/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
      <Friend params={params} />
    </Suspense>
  );
}

async function Friend({ params }: { params: PageProps<"/friends/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const v = await getFriendView(id);
  if (!v) notFound();
  const today = todayInIsrael();
  const s = summarize(v, today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  return (
    <>
      <Link href="/friends" className="text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">
        → חזרה לחברים
      </Link>
      <header className="mt-3 flex items-center gap-4">
        <Avatar name={v.name} url={v.avatar_url} size={56} />
        <div>
          <h1 className="font-display text-4xl">{v.name}</h1>
          {v.share.study && (
            <p className="text-ink-soft">
              השבוע {minutesLabel(s.week)} לימוד{s.lastWeek ? ` · בשבוע שעבר ${minutesLabel(s.lastWeek)}` : ""}
            </p>
          )}
        </div>
      </header>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        {s.courses.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">קורסים</h2>
            {s.courses.map(({ course, st }) => (
              <div key={course.code} className="panel px-5 pb-4 pt-4" style={{ borderTop: `4px solid ${course.color}` }}>
                <div className="font-semibold">{course.name}</div>
                {v.share.progress ? (
                  <>
                    <WeightBar course={course} st={st} color={course.color} />
                    <StandingText st={st} min={course.assignmentWeight.min} max={course.assignmentWeight.max} />
                  </>
                ) : (
                  <p className="text-sm text-ink-soft">ההתקדמות לא משותפת.</p>
                )}
              </div>
            ))}
            {s.nextExam && (
              <p className="text-sm text-ink-soft">
                הבחינה הקרובה: {v.courses.find((c) => c.code === s.nextExam!.course_code)?.name},{" "}
                {relativeDays(daysBetween(today, s.nextExam.date))}
              </p>
            )}
          </section>
        )}

        {v.schedule !== "none" && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">השבוע הקרוב</h2>
            <ul className="panel divide-y divide-rule">
              {days.map((d) => {
                const list = s.blocks.filter((b) => b.date === d);
                return (
                  <li key={d} className="flex gap-4 px-4 py-3">
                    <span className="w-16 shrink-0 text-sm text-ink-soft">
                      {d === today ? "היום" : formatHebrewDate(d, { weekday: "short", day: "numeric", month: "numeric" })}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                      {list.length === 0 ? (
                        <span className="text-ink-soft">פנוי/ה</span>
                      ) : (
                        list.map((b, k) => (
                          <span key={k} className="truncate">
                            <span className="tabular-nums text-ink-soft">
                              {b.start}–{b.end}
                            </span>{" "}
                            {b.title}
                          </span>
                        ))
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {v.schedule === "busy" && <p className="mt-2 text-xs text-ink-soft">משתף/ת רק מתי עסוק/ה, בלי פרטים.</p>}
          </section>
        )}

        {s.routines.length > 0 && (
          <section className="lg:col-span-2">
            <h2 className="mb-3 text-lg font-semibold">שגרה</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {s.routines
                .filter((r) => r.routine.category !== "sleep")
                .map(({ routine, progress, streak }) => (
                  <li key={routine.id} className="panel flex items-center gap-3 p-4">
                    <span className="text-2xl" aria-hidden>
                      {emojiOf(routine)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{routine.title}</div>
                      <div className="text-xs text-ink-soft">{describe(routine)}</div>
                    </div>
                    <div className="text-end text-xs text-ink-soft">
                      <div className="tabular-nums">
                        <b className="text-ink">{Math.min(progress.done, progress.target)}</b>/{progress.target}
                      </div>
                      {streak.count > 1 && <div>🔥 {streak.count}</div>}
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
