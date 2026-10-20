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
import { Heatmap } from "@/components/Heatmap";
import { BadgeGrid } from "@/components/BadgeGrid";
import { computeBadges } from "@/lib/badges";
import { coursesFor, progressKey } from "@/lib/progress";
import { courseFromRow, semester } from "@/lib/semester";
import { CheerButtons } from "@/components/SocialBits";

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
  const studyDays = Object.entries(v.study ?? {}).reduce<Record<string, number>>((acc, [k, m]) => {
    const d = k.split("|")[0];
    acc[d] = (acc[d] ?? 0) + m;
    return acc;
  }, {});
  const progress = Object.fromEntries(
    v.progress.filter((p) => p.semester === semester.semester).map((p) => [progressKey(p.course_code, p.n), { status: p.status, grade: p.grade ?? null, due: p.due_override ?? null }]),
  );
  const badges = computeBadges({
    today,
    studyDays: v.share.study ? studyDays : undefined,
    courses: v.share.progress ? coursesFor(progress, v.courses.map(courseFromRow)) : undefined,
    progress: v.share.progress ? progress : undefined,
    routines: v.share.routines ? v.routines : undefined,
    logs: v.share.routines ? v.routine_logs : undefined,
    friends: v.friends_count,
    cheersReceived: v.cheers_received,
  });

  return (
    <>
      <Link href="/friends" className="text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">
        → חזרה לחברים
      </Link>
      <header className="mt-3 flex items-center gap-4">
        <Avatar name={v.name} url={v.avatar_url} emoji={v.avatar_emoji} color={v.avatar_color} size={72} />
        <div>
          <h1 className="font-display text-4xl">{v.name}</h1>
          {(v.program || v.study_year) && <p className="text-ink-soft">{[v.program, v.study_year].filter(Boolean).join(" · ")}</p>}
          {v.bio && <p className="mt-1 max-w-xl leading-relaxed">{v.bio}</p>}
          {v.share.study && (
            <p className="text-ink-soft">
              השבוע {minutesLabel(s.week)} לימוד{s.lastWeek ? ` · בשבוע שעבר ${minutesLabel(s.lastWeek)}` : ""}
            </p>
          )}
          <div className="mt-2">
            <CheerButtons to={v.id} label={s.week ? `על ${minutesLabel(s.week)} לימוד השבוע` : "סתם כי"} />
          </div>
        </div>
      </header>

      <section className="panel mt-6 p-5">
        <h2 className="mb-3 font-semibold">תגים</h2>
        <BadgeGrid badges={badges} compact />
      </section>

      {v.share.study && (
        <section className="panel mt-6 overflow-x-auto p-5">
          <Heatmap today={today} days={studyDays} />
          {v.weekly_goal_minutes ? (
            <p className="mt-2 text-sm text-ink-soft">
              יעד שבועי: {minutesLabel(v.weekly_goal_minutes)}, השבוע {minutesLabel(s.week)}
            </p>
          ) : null}
        </section>
      )}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
        {s.courses.length > 0 && (
          <section className="space-y-4">
            <h2 className="section-title">קורסים</h2>
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
            <h2 className="section-title mb-3">השבוע הקרוב</h2>
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
                              <bdi dir="ltr">{b.start}–{b.end}</bdi>
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
            <h2 className="section-title mb-3">שגרה</h2>
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
