import { Suspense } from "react";
import { sleepInFor } from "@/lib/sleepIn";
import { SleepInCard } from "@/components/SleepInCard";
import Link from "next/link";
import { connection } from "next/server";
import { DeadlineList, type DeadlineRowData } from "@/components/DeadlineList";
import { standingSentence, WeightBar } from "@/components/CourseParts";
import { progressKey, standing } from "@/lib/progress";
import { hasPushSubscription, getCheerCounts, getMyProfile, getMyStudyDays, getNames, getPendingInvites, getPeople, getStudyingNow, getUpdates, getUserPlan } from "@/lib/userdata";
import { Fold, Gallery } from "@/components/Fold";
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
import { baseRef, minutesLabel, nextExams, sessionKey, type Session } from "@/lib/planner";
import { academicEvents, academicOn } from "@/lib/academic";
import { SessionToggle } from "@/components/SessionToggle";
import { ShareDay } from "@/components/ShareDay";
import { FirstSteps } from "@/components/FirstSteps";
import { UpNext, type UpNextItem } from "@/components/UpNext";
import { israelNow } from "@/lib/privateFeed";
import { supabaseEnabled } from "@/lib/supabase/config";
import { Icon } from "@/components/Icon";
import { getBooks, readingByCourse, type Reading } from "@/lib/books";
import { getReadings, weekFor, type ReadingItem } from "@/lib/readings";
import { ReadChips } from "@/components/ReadChips";
import { MathText } from "@/components/MathText";
import { getForumPosts } from "@/lib/forum";
import { SessionAgendaFor } from "@/components/SessionAgendaFor";
import { PracticeMarksCard } from "@/components/PracticeMarks";
import { ExamCandidates } from "@/components/ExamCandidates";
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
  // Everything in one round: the page waits for the slowest call, not for the sum of them.
  const [{ progress, exams, plan, status, courses, events, routines, logs, offDays, manualOff, prefs }, updates, invites, people, live, profile, studyDays, cheers, hasPush, books] =
    await Promise.all([getUserPlan(today), getUpdates(), getPendingInvites(), getPeople(), getStudyingNow(), getMyProfile(), getMyStudyDays(), getCheerCounts(), hasPushSubscription(), getBooks()]);
  const reading = readingByCourse(books);
  const [plans, forum] = await Promise.all([getReadings(books), getForumPosts()]);
  const forumNew = forum.filter((f) => !f.isRead && daysBetween(f.at.slice(0, 10), today) <= 14).slice(0, 4);
  const weekOf = (code: string | null | undefined, date: string) => (code ? weekFor(plans.weeks[code], date) : null);
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

  // Up next: the session or event happening now or next today.
  const nowMin = israelNow().minutes;
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const sessionNext = todaySessions.filter((x) => !status[sessionKey(x)] && mins(x.end) > nowMin)[0];
  const eventNext = todayEvents
    .filter((e) => e.start_time && !e.cancelled && mins(e.end_time ?? e.start_time) > nowMin)
    .sort((a, b) => a.start_time!.localeCompare(b.start_time!))[0];
  const upNext: UpNextItem | null =
    sessionNext && (!eventNext || sessionNext.start <= eventNext.start_time!)
      ? { title: sessionNext.title, start: sessionNext.start, end: sessionNext.end, color: themeOf(courses, sessionNext.courseCode).color, session: sessionNext }
      : eventNext
        ? { title: eventNext.title, start: eventNext.start_time!, end: eventNext.end_time, color: eventNext.course_code ? themeOf(courses, eventNext.course_code).color : "var(--ink-soft)", place: eventNext.location }
        : null;
  const tomorrowFirst = plan.sessions.find((x) => x.date === addDays(today, 1));
  const sleepIn = sleepInFor({ today, routines, plan, events, courses, exams, offDays });
  const examSoon = upcomingExams.find((e) => daysBetween(today, e.date) <= 14);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_auto_1fr] lg:gap-x-10">
      {/* Day header spans both columns */}
      <header className="lg:col-span-2">
        <p className="flex items-baseline gap-3 text-ink-soft">
          <span>{formatHebrewDate(today, { weekday: "long" })}</span>
          {show("clock") && <LiveClock className="font-medium text-ink" />}
        </p>
        <h1 className="font-display text-[2.75rem] leading-none sm:text-6xl">{formatHebrewDate(today, { day: "numeric", month: "long" })}</h1>
        {(academicToday.length > 0 || nextAcademic) && (
          <p className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm text-ink-soft ring-1 ring-rule">
            <Icon name="cap" className="size-4" />
            {academicToday.length > 0
              ? academicToday.map((a) => a.title).join(", ")
              : `${nextAcademic!.title} ${relativeDays(daysBetween(today, nextAcademic!.date))} (${formatHebrewDate(nextAcademic!.date, { day: "numeric", month: "numeric" })})`}
          </p>
        )}
        {(jToday?.holidays.length || jToday?.candles || jToday?.havdalah || jToday?.parasha || jNext || (jp.rest && jToday?.rest)) && (
          <p className="mt-2 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full bg-surface px-3 py-1 text-sm text-ink-soft ring-1 ring-rule">
            <span aria-hidden className="text-base leading-none">✡︎</span>
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
      </header>

      <section aria-labelledby="soon-title" className="min-w-0 space-y-8 lg:col-start-1">
        <BadgeToast earned={earned} />

        {courses.length > 0 && (
          <UpNext
            nowMin={nowMin}
            item={upNext}
            reading={upNext?.session?.courseCode ? reading[upNext.session.courseCode] ?? null : null}
            prep={!upNext?.session && eventNext?.kind === "tutorial" && upNext ? weekOf(eventNext.course_code, today) : null}
            status={upNext?.session ? status[sessionKey(upNext.session)] : undefined}
            tomorrow={tomorrowFirst}
            deadline={
              next
                ? {
                    label: `${typeLabel[next.type]} ${next.n} ב${themeOf(courses, next.course.code).short}`,
                    when: relativeDays(next.daysLeft),
                    urgent: next.daysLeft <= 7,
                  }
                : null
            }
            exam={
              examSoon
                ? { course: courses.find((c) => c.code === examSoon.course_code)?.name ?? examSoon.course_code, days: daysBetween(today, examSoon.date), time: examSoon.start_time ?? null }
                : null
            }
          />
        )}

        {supabaseEnabled && sleepIn && <SleepInCard s={sleepIn} />}

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

        {supabaseEnabled && (show("dayoff") || isOff) && <DayOff date={today} isOff={isOff} sessionsToday={todaySessions.filter((x) => !status[sessionKey(x)]).length} routinesToday={todayRoutines.filter((o) => !o.done && o.category !== "meal").length} />}

        <FirstSteps
          steps={[
            { label: "להוסיף את הקורסים של הסמסטר", href: "/courses", done: courses.length > 0 },
            { label: "להזין מועדי בחינות (כשמתפרסמים)", href: "/settings#study", done: exams.length > 0 },
            { label: "להוסיף שגרה: שינה, ארוחות, ספורט", href: "/routines", done: routines.length > 0 },
            { label: "להפעיל התראות בטלפון", href: "/settings#notify", done: hasPush },
          ]}
        />

        {invites.length > 0 && <InvitesList invites={invites} names={inviters} />}

        {updates.length > 0 && <UpdatesList updates={updates} />}

        <PracticeMarksCard />

        <ExamCandidates />

        {show("forums") && forumNew.length > 0 && (
          <div>
            <h2 className="section-title mb-3">חדש בפורומים</h2>
            <ul className="panel divide-y divide-rule overflow-hidden">
              {forumNew.map((f) => (
                <li key={f.mailId}>
                  <Link href={`/mail?open=${f.mailId}`} className="flex items-start gap-3 px-4 py-3 hover:bg-bg">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: themeOf(courses, f.courseCode).color }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{f.topic}</span>
                      <span className="block text-xs text-ink-soft">
                        {themeOf(courses, f.courseCode).short} · {f.forum}
                        {f.author ? ` · ${f.author}` : ""}
                        {f.assignment ? ` · על מטלה ${f.assignment}` : ""}
                      </span>
                      {f.text && <span className="mt-1 line-clamp-2 block text-sm text-ink-soft">{f.text}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h2 className="section-title mb-3">התוכנית להיום</h2>
          <div className="panel overflow-hidden">
            {todayEvents.length > 0 && (
              <ul className="divide-y divide-rule border-b border-rule bg-bg/40">
                {todayEvents.map((e) => (
                  <li key={e.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:px-5 ${e.cancelled ? "text-ink-soft line-through" : ""}`}>
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
                    {e.kind === "tutorial" && !e.cancelled && weekOf(e.course_code, e.date)?.links.length ? (
                      <span className="basis-full ps-[3.75rem] text-xs text-ink-soft">
                        לקראת המפגש: <MathText text={weekOf(e.course_code, e.date)!.label} />
                        <ReadChips links={weekOf(e.course_code, e.date)!.links} className="mt-1" />
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {todaySessions.length ? (
              <SessionList sessions={todaySessions} status={status} courses={courses} reading={reading} assignmentPlans={plans.assignments} />
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
                        {[...list].sort((a, b) => a.start.localeCompare(b.start)).map((x) => (
                          <span key={x.start} className="flex items-center gap-2">
                            <span className="size-2 shrink-0 rounded-full" style={{ background: themeOf(courses, x.courseCode).color }} />
                            <span className="truncate">{x.title}</span>
                            <bdi dir="ltr" className="ms-auto shrink-0 tabular-nums text-ink-soft">{x.start}–{x.end}</bdi>
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
            <details className="group mt-3 text-sm">
              <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                <Icon name="alert" className="size-4 text-ink-soft" />
                <span className="hl">
                  חסרות {minutesLabel(plan.warnings.reduce((n, w) => n + w.missingMinutes, 0))} לימוד לפני {plan.warnings.length}{" "}
                  {plan.warnings.length === 1 ? "מטלה" : "מטלות"}
                </span>
                <span className="text-ink-soft group-open:hidden">פירוט</span>
              </summary>
              <ul className="mt-2 space-y-1 ps-7 text-ink-soft">
                {plan.warnings.map((w) => {
                  const c = courses.find((x) => x.code === w.courseCode);
                  // Too late to fit it in: offer a ready-made extension request to the course coordinator.
                  const tight = w.missingMinutes >= 120;
                  const body = `שלום${c?.coordinator ? ` ${c.coordinator}` : ""},\n\nאני סטודנט/ית בקורס ${c?.name ?? ""} (${w.courseCode}) בסמסטר ${semester.semester}.\nאבקש הארכה בהגשת ${w.title}, בגלל ___.\nאשמח לדעת אם זה אפשרי ועד מתי.\n\nתודה רבה,\n${profile?.name ?? ""}`;
                  return (
                    <li key={w.title}>
                      {w.title}: חסרות {minutesLabel(w.missingMinutes)}
                      {tight && (
                        <>
                          {" · "}
                          <a
                            href={`mailto:?subject=${encodeURIComponent(`בקשת הארכה: ${w.title} (${w.courseCode})`)}&body=${encodeURIComponent(body)}`}
                            className="text-ink underline underline-offset-4 decoration-rule"
                          >
                            <Icon name="mail" className="me-1 size-4" />
                            לבקש הארכה
                          </a>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Link href="/settings#study" className="mt-2 inline-block ps-7 text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">
                הוספת זמני לימוד
              </Link>
            </details>
          )}
        </div>

        {(studyDays[today] ?? 0) > 0 || todaySessions.some((x) => status[sessionKey(x)] === "done") ? (
          <ShareDay
            name={(profile?.name ?? "").split(" ")[0] || "אני"}
            date={formatHebrewDate(today, { weekday: "long", day: "numeric", month: "long" })}
            minutes={studyDays[today] ?? 0}
            sessions={todaySessions.filter((x) => status[sessionKey(x)] === "done").length}
            routines={todayRoutines.filter((o) => o.done).length}
            streak={studyStreak(studyDays, today)}
          />
        ) : null}

        {!show("routines") ? null : todayRoutines.length > 0 ? (
          <TodayRoutines items={todayRoutines} date={today} />
        ) : (
          <Link href="/routines" className="block text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">
            הוספת שגרה: שינה, ארוחות, ספורט, הרגלים
          </Link>
        )}

        {show("deadlines") && <div>
        <h2 id="soon-title" className="section-title mb-3">
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
        {show("reading") && courses.some((c) => plans.weeks[c.code] || reading[c.code]) && (
          <div className="mb-6">
            <h2 className="section-title mb-3">לקריאה השבוע</h2>
            <ul className="panel divide-y divide-rule overflow-hidden">
              {courses
                .filter((c) => plans.weeks[c.code] || reading[c.code])
                .map((c) => {
                  const w = weekOf(c.code, today);
                  const r = reading[c.code];
                  const before = w?.starts && w.starts > today;
                  return (
                    <li key={c.code} className="px-4 py-3">
                      <div className="flex items-baseline gap-2">
                        <span className="size-2 shrink-0 self-center rounded-full" style={{ background: themeOf(courses, c.code).color }} aria-hidden />
                        <span className="font-medium">{themeOf(courses, c.code).short}</span>
                        {w && (
                          <span className="min-w-0 truncate text-sm text-ink-soft">
                            {before ? `שבוע ${w.ref} (מ־${formatHebrewDate(w.starts!, { day: "numeric", month: "numeric" })})` : `שבוע ${w.ref}`}: <MathText text={w.label} />
                            {w.estimated ? " · הצעה" : ""}
                          </span>
                        )}
                      </div>
                      {w && <ReadChips links={w.links} className="mt-2" />}
                      {r?.lastPage && (
                        <Link href={r.href} className="mt-2 flex items-center gap-1 text-xs text-ink-soft hover:text-ink">
                          <Icon name="bookmark" className="size-3.5" />
                          להמשיך: {r.title}, עמ׳ {r.lastPage}
                        </Link>
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
        {show("standings") && <>
        <h2 id="courses-title" className="section-title mb-3">
          מצב בקורסים
        </h2>
        <Gallery cols="sm:grid-cols-2 lg:grid-cols-1" className="lg:gap-3">
          {courses.map((c) => {
            const theme = themeOf(courses, c.code);
            const st = standing(c, progress, today);
            const s = standingSentence(st, c.assignmentWeight.min, c.assignmentWeight.max);
            return (
              <div key={c.code}>
                <Link
                  href={`/courses#c${c.code}`}
                  className="panel block h-full px-4 py-4 transition-colors hover:border-ink-soft"
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
              </div>
            );
          })}
        </Gallery>
        </>}
      </section>
      {later.length > 0 && show("deadlines") && (
        <div className="min-w-0 lg:col-start-1">
          <Fold
            id="today-later"
            bare
            title="אחר כך"
            summary={`${later.length} הגשות, הבאה ב־${formatHebrewDate(later[0].due, { day: "numeric", month: "numeric" })}`}
            defaultOpen={false}
          >
            <div className="panel overflow-hidden">
              <DeadlineList rows={later.map(toRow)} editable={supabaseEnabled} empty={null} />
            </div>
            <Link
              href="/semester"
              className="mt-3 inline-block text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink"
            >
              כל המטלות בסמסטר
            </Link>
          </Fold>
        </div>
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

function SessionList({ sessions, status, courses, reading, assignmentPlans }: { sessions: Session[]; status: Record<string, "done" | "skipped">; courses: Course[]; reading: Record<string, Reading>; assignmentPlans: Record<string, Record<string, ReadingItem>> }) {
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
              {x.kind === "assignment" ? "הכנה למטלה, " : x.kind === "exam" ? "חזרה לבחינה, " : x.why ? `יותר זמן כאן: ${x.why}. ` : ""}עד {x.end}
            </div>
            {x.kind === "assignment" && x.ref && assignmentPlans[x.courseCode]?.[baseRef(x.ref).replace(/^a/, "")] ? (
              <ReadChips links={assignmentPlans[x.courseCode][baseRef(x.ref).replace(/^a/, "")].links} className="mt-1" />
            ) : x.courseCode && reading[x.courseCode] && (
              <Link href={reading[x.courseCode].href} className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft hover:text-ink">
                <Icon name="book" className="size-3.5 shrink-0" />
                <span className="truncate underline decoration-rule underline-offset-2">{reading[x.courseCode].title}</span>
              </Link>
            )}
            <SessionAgendaFor session={x} />
          </div>
          {supabaseEnabled && <SessionToggle sessionKey={sessionKey(x)} status={status[sessionKey(x)]} minutes={x.minutes} title={x.title} courseCode={x.courseCode} />}
        </li>
      ))}
    </ol>
  );
}

const REVISION_DAYS = 21;

function ExamCountdown({ today, upcoming, courses }: { today: string; upcoming: ReturnType<typeof nextExams>; courses: Course[] }) {
  if (upcoming.length === 0)
    return (
      <Link href="/settings#study" className="mb-6 flex items-center gap-2 rounded-lg border border-dashed border-rule px-4 py-2.5 text-sm text-ink-soft hover:border-ink-soft hover:text-ink">
        <Icon name="calendar" className="size-4" />
        <span className="flex-1">להוסיף מועדי בחינות לספירה לאחור</span>
        <Icon name="plus" className="size-4" />
      </Link>
    );
  return (
    <div className="mb-6">
      <h2 className="section-title mb-3">בחינות</h2>
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

/** Days in a row (up to today) with logged study. */
function studyStreak(days: Record<string, number>, today: string) {
  let n = 0;
  for (let d = (days[today] ?? 0) > 0 ? today : addDays(today, -1); (days[d] ?? 0) > 0 && n < 400; d = addDays(d, -1)) n++;
  return n;
}
