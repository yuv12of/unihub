import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { DeadlineList, type DeadlineRowData } from "@/components/DeadlineList";
import { standingSentence, WeightBar } from "@/components/CourseParts";
import { progressKey, standing } from "@/lib/progress";
import { getCheerCounts, getMyProfile, getMyStudyDays, getNames, getPendingInvites, getPeople, getStudyingNow, getUpdates, getUserPlan } from "@/lib/userdata";
import { LiveClock } from "@/components/LiveClock";
import { jewishDays, jewishPrefs } from "@/lib/hebcal";
import { computeBadges } from "@/lib/badges";
import { BadgeToast } from "@/components/BadgeToast";
import { QuickAdd } from "@/components/QuickAdd";
import { StudyingNow } from "@/components/StudyingNow";
import { DayOff } from "@/components/DayOff";
import { occurrencesFor } from "@/lib/planfor";
import { TodayRoutines } from "@/components/TodayRoutines";
import { InvitesList } from "@/components/InvitesList";
import { UpdatesList } from "@/components/UpdatesList";
import { minutesLabel, nextExams, sessionKey, type Session } from "@/lib/planner";
import { academicEvents, academicOn } from "@/lib/academic";
import { SessionToggle } from "@/components/SessionToggle";
import { supabaseEnabled } from "@/lib/supabase/config";
import {
  addDays,
  allDeadlines,
  daysBetween,
  formatHebrewDate,
  relativeDays,
  semester,
  todayInIsrael,
  typeLabel,
  type DeadlineItem, type Course, themeOf } from "@/lib/semester";

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
  const theme = d.course;
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
  const [{ progress, exams, plan, status, courses, events, routines, logs, offDays, manualOff, prefs }, updates, invites, people, live] = await Promise.all([
    getUserPlan(today),
    getUpdates(),
    getPendingInvites(),
    getPeople(),
    getStudyingNow(),
  ]);
  const [profile, studyDays, cheers] = await Promise.all([getMyProfile(), getMyStudyDays(), getCheerCounts()]);
  const hidden = new Set(profile?.prefs?.hidden ?? []);
  const show = (k: string) => !hidden.has(k);
  const inviters = await getNames([...invites.map((i) => i.inviter), ...live.map((l) => l.user_id)]);
  const connected = people.filter((p) => p.i_follow === "accepted" || p.follows_me === "accepted").map((p) => ({ id: p.id, name: p.name }));
  const isOff = manualOff.includes(today);
  const jp = jewishPrefs(prefs.jewish);
  const jdays = jp.show || jp.times ? await jewishDays(jp, today, addDays(today, 14)) : {};
  const jRaw = jdays[today];
  // Holidays and Shabbat times are separate choices; keep only what this user wants to see.
  const jToday = jRaw && {
    ...jRaw,
    holidays: jp.show ? jRaw.holidays : [],
    candles: jp.times ? jRaw.candles : undefined,
    havdalah: jp.times ? jRaw.havdalah : undefined,
    parasha: jp.times ? jRaw.parasha : undefined,
  };
  const jNext = !jp.show ? undefined : Object.values(jdays)
    .filter((d) => d.date > today && d.holidays.some((h) => h.major))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const earned = computeBadges({
    today,
    studyDays,
    weeklyGoal: profile?.weekly_goal_minutes,
    courses,
    progress,
    routines,
    logs,
    offDays,
    friends: connected.length,
    cheersSent: cheers.sent,
    cheersReceived: cheers.received,
  })
    .filter((b) => b.earned)
    .map((b) => ({ id: b.id, emoji: b.emoji, title: b.title }));
  const todayRoutines = occurrencesFor({ routines, logs, events, plan, today, from: today, to: today, offDays }).filter((o) => o.category !== "sleep");
  const todayEvents = events.filter((e) => e.date === today && (e.kind !== "other" || e.source === "opal" || e.source === "google"));
  const academicToday = academicOn(today);
  const nextAcademic = academicEvents.find((e) => e.date > today);
  const todaySessions = plan.sessions.filter((x) => x.date === today);
  const week = groupByDay(plan.sessions.filter((x) => x.date > today && x.date <= addDays(today, 6)));
  const upcomingExams = nextExams(exams, today);
  const open = allDeadlines(today, courses).filter((d) => {
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
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h1 className="font-display text-[2.75rem] leading-none sm:text-6xl">
            {formatHebrewDate(today, { day: "numeric", month: "long" })}
          </h1>
          {show("clock") && <LiveClock seconds className="font-display text-3xl text-ink-soft sm:text-5xl" />}
        </div>
        {(academicToday.length > 0 || nextAcademic) && (
          <p className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm text-ink-soft ring-1 ring-rule">
            <span aria-hidden>🎓</span>
            {academicToday.length > 0
              ? academicToday.map((a) => a.title).join(", ")
              : `${nextAcademic!.title} ${relativeDays(daysBetween(today, nextAcademic!.date))} (${formatHebrewDate(nextAcademic!.date, { day: "numeric", month: "numeric" })})`}
          </p>
        )}
        {(jToday?.holidays.length || jToday?.candles || jToday?.havdalah || jToday?.parasha || jNext || (jp.rest && jToday?.rest)) && (
          <p className="mt-2 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full bg-surface px-3 py-1 text-sm text-ink-soft ring-1 ring-rule">
            <span aria-hidden>✡️</span>
            {jToday?.holidays.length ? <span className="text-ink">{jToday.holidays.map((h) => h.title).join(", ")}</span> : null}
            {jToday?.parasha && <span>{jToday.parasha}</span>}
            {jToday?.candles && <span>הדלקת נרות {jToday.candles}</span>}
            {jToday?.havdalah && <span>הבדלה {jToday.havdalah}</span>}
            {jNext && !jToday?.holidays.some((h) => h.major) && (
              <span>
                {jNext.holidays.find((h) => h.major)!.title} {relativeDays(daysBetween(today, jNext.date))}
              </span>
            )}
            {jp.rest && jToday?.rest && <span className="text-ink">יום מנוחה, בלי תכנון ותזכורות</span>}
          </p>
        )}
        {next && (
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-soft">
            ההגשה הבאה היא{" "}
            <span className="font-medium text-ink">
              {typeLabel[next.type]} {next.n} ב{themeOf(courses, next.course.code).short}
            </span>
            ,{" "}
            <span className={next.daysLeft <= 7 ? "hl font-medium" : "font-medium text-ink"}>
              {relativeDays(next.daysLeft)}
            </span>
            .
          </p>
        )}
      </header>

      <section aria-labelledby="soon-title" className="min-w-0 space-y-8 lg:col-start-1">
        <BadgeToast earned={earned} />

        {supabaseEnabled && show("quickadd") && <QuickAdd today={today} people={connected} />}

        {show("live") && <StudyingNow
          rows={live.map((l) => ({
            user_id: l.user_id,
            name: inviters[l.user_id]?.name ?? "חבר/ה",
            avatar_url: inviters[l.user_id]?.avatar_url ?? null,
            avatar_emoji: inviters[l.user_id]?.avatar_emoji,
            avatar_color: inviters[l.user_id]?.avatar_color,
            title: l.title,
            ends_at: l.ends_at,
          }))}
        />}

        {supabaseEnabled && (show("dayoff") || isOff) && <DayOff date={today} isOff={isOff} />}

        {courses.length === 0 && (
          <Link href="/courses" className="panel block p-5 hover:border-ink-soft">
            <span className="block font-semibold">ברוכים הבאים ל־Unihub</span>
            <span className="mt-1 block text-ink-soft">
              מתחילים בהוספת הקורסים של הסמסטר (לפי מספר הקורס), ואז שגרה: שינה, ארוחות, ספורט. התוכנית תיבנה מזה לבד.
            </span>
          </Link>
        )}

        {invites.length > 0 && <InvitesList invites={invites} names={inviters} />}

        {updates.length > 0 && <UpdatesList updates={updates} />}

        <div>
          <h2 className="mb-3 text-lg font-semibold">התוכנית להיום</h2>
          <div className="panel overflow-hidden">
            {todayEvents.length > 0 && (
              <ul className="divide-y divide-rule border-b border-rule bg-bg/40">
                {todayEvents.map((e) => (
                  <li key={e.id} className={`flex items-center gap-4 px-4 py-2.5 text-sm sm:px-5 ${e.cancelled ? "text-ink-soft line-through" : ""}`}>
                    <span className="w-11 shrink-0 text-center tabular-nums font-medium">{e.start_time ?? "כל היום"}</span>
                    <span
                      className="h-6 w-1 shrink-0 rounded-full"
                      style={{ background: e.course_code ? themeOf(courses, e.course_code).color : "var(--ink-soft)" }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {e.cancelled ? "בוטל: " : ""}
                      {e.title}
                      {e.location && <span className="text-ink-soft"> · {e.location}</span>}
                    </span>
                    {e.end_time && <span className="shrink-0 text-xs text-ink-soft">עד {e.end_time}</span>}
                  </li>
                ))}
              </ul>
            )}
            {todaySessions.length ? (
              <SessionList sessions={todaySessions} status={status} courses={courses} />
            ) : (
              <p className="px-5 py-5 text-ink-soft">
                {week.length
                  ? `היום פנוי. המפגש הבא: ${formatHebrewDate(week[0][0], { weekday: "long" })}.`
                  : "אין לימוד מתוכנן היום."}
              </p>
            )}
            {week.length > 0 && (
              <details className="border-t border-rule">
                <summary className="cursor-pointer px-5 py-3 text-sm text-ink-soft hover:text-ink">
                  שאר השבוע ({week.reduce((n, [, l]) => n + l.length, 0)} מפגשים)
                </summary>
                <ul className="divide-y divide-rule border-t border-rule">
                  {week.map(([day, list]) => (
                    <li key={day} className="flex gap-4 px-5 py-3">
                      <span className="w-14 shrink-0 text-sm text-ink-soft">
                        {formatHebrewDate(day, { weekday: "short" })} {formatHebrewDate(day, { day: "numeric", month: "numeric" })}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                        {list.map((x) => (
                          <span key={x.start} className="flex items-center gap-2">
                            <span className="size-2 shrink-0 rounded-full" style={{ background: themeOf(courses, x.courseCode).color }} />
                            <span className="truncate">{x.title}</span>
                            <span className="ms-auto shrink-0 tabular-nums text-ink-soft">{x.start}</span>
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          {plan.warnings.length > 0 && (
            <p className="mt-3 text-sm leading-relaxed">
              <span className="hl">
                אין מספיק זמן לימוד לפני{" "}
                {plan.warnings.map((w) => `${w.title} (חסרות ${minutesLabel(w.missingMinutes)})`).join(", ")}.
              </span>{" "}
              <Link href="/settings" className="text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">
                הוספת זמני לימוד
              </Link>
            </p>
          )}
        </div>

        {!show("routines") ? null : todayRoutines.length > 0 ? (
          <TodayRoutines items={todayRoutines} date={today} />
        ) : (
          <Link href="/routines" className="block text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">
            הוספת שגרה: שינה, ארוחות, ספורט, הרגלים
          </Link>
        )}

        {show("deadlines") && <div>
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
        </div>}
      </section>

      <section aria-labelledby="courses-title" className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-2">
        {show("exams") && <ExamCountdown today={today} upcoming={upcomingExams} courses={courses} />}
        {show("standings") && <>
        <h2 id="courses-title" className="mb-3 text-lg font-semibold">
          מצב בקורסים
        </h2>
        <ul className="space-y-3">
          {courses.map((c) => {
            const theme = themeOf(courses, c.code);
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
        </>}
      </section>
      {later.length > 0 && show("deadlines") && (
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

function groupByDay(sessions: Session[]): [string, Session[]][] {
  const m = new Map<string, Session[]>();
  for (const x of sessions) {
    if (!m.has(x.date)) m.set(x.date, []);
    m.get(x.date)!.push(x);
  }
  return [...m];
}

function SessionList({ sessions, status, courses }: { sessions: Session[]; status: Record<string, "done" | "skipped">; courses: Course[] }) {
  return (
    <ol className="divide-y divide-rule">
      {sessions.map((x) => (
        <li key={x.start} className="flex items-center gap-4 px-4 py-3 sm:px-5">
          <div className="w-11 shrink-0 text-center tabular-nums leading-tight">
            <div className="text-[17px] font-semibold">{x.start}</div>
            <div className="text-[11px] text-ink-soft">{minutesLabel(x.minutes)}</div>
          </div>
          <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: themeOf(courses, x.courseCode).color }} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{x.title}</div>
            <div className="text-xs text-ink-soft">
              {x.kind === "assignment" ? "הכנה למטלה, " : x.kind === "exam" ? "חזרה לבחינה, " : ""}עד {x.end}
            </div>
          </div>
          {supabaseEnabled && <SessionToggle sessionKey={sessionKey(x)} status={status[sessionKey(x)]} minutes={x.minutes} title={x.title} />}
        </li>
      ))}
    </ol>
  );
}

const REVISION_DAYS = 21;

function ExamCountdown({ today, upcoming, courses }: { today: string; upcoming: ReturnType<typeof nextExams>; courses: Course[] }) {
  if (upcoming.length === 0)
    return (
      <Link href="/settings" className="panel mb-6 block px-4 py-4 text-sm text-ink-soft hover:border-ink-soft">
        <span className="block font-medium text-ink">ספירה לאחור לבחינות</span>
        מועדי הבחינות עוד לא הוזנו. כשיתפרסמו, הוסיפו אותם בהגדרות.
      </Link>
    );
  return (
    <div className="mb-6">
      <h2 className="mb-3 text-lg font-semibold">בחינות</h2>
      <ul className="panel divide-y divide-rule overflow-hidden">
        {upcoming.map((e) => {
          const days = daysBetween(today, e.date);
          const course = courses.find((c) => c.code === e.course_code);
          const revising = days <= REVISION_DAYS;
          return (
            <li key={e.course_code} className="flex items-center gap-4 px-4 py-3">
              <div className="w-14 shrink-0 text-center leading-none">
                <div className="font-display text-3xl tabular-nums">{days}</div>
                <div className="mt-1 text-[11px] text-ink-soft">{days === 1 ? "יום" : "ימים"}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-medium">
                  <span className="size-2 rounded-full" style={{ background: themeOf(courses, e.course_code).color }} />
                  <span className="truncate">{course?.name}</span>
                </div>
                <div className="text-xs text-ink-soft">
                  מועד {e.moed}, {formatHebrewDate(e.date, { day: "numeric", month: "long" })}
                  {e.start_time ? ` ב־${e.start_time}` : ""}
                </div>
                {revising && <div className="mt-1 text-xs"><span className="hl">תקופת חזרות</span></div>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
