import { Suspense } from "react";
import { sleepInFor } from "@/lib/sleepIn";
import { SleepInCard } from "@/components/SleepInCard";
import Link from "next/link";
import { connection } from "next/server";
import { DeadlineList, type DeadlineRowData } from "@/components/DeadlineList";
import { standingSentence } from "@/components/CourseParts";
import { progressKey, standing } from "@/lib/progress";
import { hasPushSubscription, getCheerCounts, getMyProfile, getMyStudyDays, getNames, getPendingInvites, getPeople, getPrefs, getStudyingNow, getUpdates, getUserPlan } from "@/lib/userdata";
import { Fold } from "@/components/Fold";
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
import { baseRef, nextExams, sessionKey, type Session } from "@/lib/planner";
import { duration, durationShort, range } from "@/lib/time";
import { weekStart } from "@/lib/routines";
import { CourseChip } from "@/components/CourseChip";
import { academicEvents, academicOn } from "@/lib/academic";
import { SessionToggle } from "@/components/SessionToggle";
import { ShareDay } from "@/components/ShareDay";
import { FirstSteps } from "@/components/FirstSteps";
import { UpNext, type UpNextItem } from "@/components/UpNext";
import { israelNow } from "@/lib/privateFeed";
import { supabaseEnabled } from "@/lib/supabase/config";
import { Chevron, Icon } from "@/components/Icon";
import { getBooks, readingByCourse, type Reading } from "@/lib/books";
import { getReadings, weekFor, type ReadingItem } from "@/lib/readings";
import { ReadChips } from "@/components/ReadChips";
import { MathText } from "@/components/MathText";
import { getForumPosts } from "@/lib/forum";
import { SessionAgendaFor } from "@/components/SessionAgendaFor";
import { PracticeMarksCard } from "@/components/PracticeMarks";
import { ExamCandidates } from "@/components/ExamCandidates";
import { DayCheckCard } from "@/components/DayCheckCard";
import { MeetupBanner } from "@/components/MeetupBanner";
import { SessionMoveButton } from "@/components/SessionMoveButton";
import { currentMeetup } from "@/lib/meetup";
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
  // (Calls that need another's result are chained inside the round instead of after it.)
  const booksP = getBooks();
  const invitesP = getPendingInvites();
  const liveP = getStudyingNow();
  const [{ progress, exams, plan, status, courses, events, routines, logs, offDays, manualOff, prefs }, updates, invites, people, live, profile, studyDays, cheers, hasPush, books, plans, forum, inviters, jdays] =
    await Promise.all([
      getUserPlan(today),
      getUpdates(),
      invitesP,
      getPeople(),
      liveP,
      getMyProfile(),
      getMyStudyDays(),
      getCheerCounts(),
      hasPushSubscription(),
      booksP,
      booksP.then(getReadings),
      getForumPosts(),
      Promise.all([invitesP, liveP]).then(([i, l]) => getNames([...i.map((x) => x.inviter), ...l.map((x) => x.user_id)])),
      getPrefs().then((p) => {
        const j = jewishPrefs(p.jewish);
        return j.show || j.times ? jewishDays(j, today, addDays(today, 14)) : ({} as Awaited<ReturnType<typeof jewishDays>>);
      }),
    ]);
  const reading = readingByCourse(books);
  const forumNew = forum.filter((f) => !f.isRead && daysBetween(f.at.slice(0, 10), today) <= 14).slice(0, 4);
  const weekOf = (code: string | null | undefined, date: string) => (code ? weekFor(plans.weeks[code], date) : null);
  const hidden = new Set(profile?.prefs?.hidden ?? []);
  const show = (k: string) => !hidden.has(k);
  const connected = people.filter((p) => p.i_follow === "accepted" || p.follows_me === "accepted").map((p) => ({ id: p.id, name: p.name }));
  const isOff = manualOff.includes(today);
  const jp = jewishPrefs(prefs.jewish);
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

  // ---- Layout: three tiers. Now (hero + the rest of today), This week, then everything else. ----
  const canEdit = supabaseEnabled || !!process.env.UNIHUB_DEMO;
  const meetupOn = currentMeetup(events, today, nowMin);
  const pastUnmarked = todaySessions.filter((x) => !status[sessionKey(x)] && mins(x.end) <= nowMin);
  const heroKey = upNext?.session ? sessionKey(upNext.session) : null;
  const heroEventId = !upNext?.session && eventNext ? eventNext.id : null;
  const dayRows: DayRow[] = [
    ...todayEvents.filter((e) => e.id !== heroEventId).map((e): DayRow => ({ kind: "event", start: e.start_time ?? "", e })),
    ...todaySessions.filter((x) => sessionKey(x) !== heroKey).map((x): DayRow => ({ kind: "session", start: x.start, x })),
  ].sort((a, b) => a.start.localeCompare(b.start));
  const ws = weekStart(today);
  const strip = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i);
    const planned = plan.sessions.filter((x) => x.date === d && status[sessionKey(x)] !== "skipped").reduce((n, x) => n + x.minutes, 0);
    return { d, planned, done: studyDays[d] ?? 0 };
  });
  const weekRest = week.reduce((n, [, l]) => n + l.length, 0);

  return (
    <div className="grid gap-x-8 gap-y-8 md:grid-cols-[minmax(0,1fr)_17rem] md:grid-rows-[auto_auto_1fr] lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-x-10">
      {/* Day header spans both columns */}
      <header className="md:col-span-2">
        <p className="flex items-baseline gap-3 text-ink-soft">
          <span>{formatHebrewDate(today, { weekday: "long" })}</span>
          {/* the computer sidebar already shows the time */}
          {show("clock") && <LiveClock className="font-medium text-ink lg:hidden" />}
        </p>
        <h1 className="font-display text-[2.75rem] leading-none sm:text-6xl">{formatHebrewDate(today, { day: "numeric", month: "long" })}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {(academicToday.length > 0 || nextAcademic) && (
            <p className="inline-flex flex-wrap items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm text-ink-soft ring-1 ring-rule">
              <Icon name="cap" className="size-4" />
              {academicToday.length > 0
                ? academicToday.map((a) => a.title).join(", ")
                : `${nextAcademic!.title} ${relativeDays(daysBetween(today, nextAcademic!.date))} (${formatHebrewDate(nextAcademic!.date, { day: "numeric", month: "numeric" })})`}
            </p>
          )}
          {(jToday?.holidays.length || jToday?.candles || jToday?.havdalah || jToday?.parasha || jNext || (jp.rest && jToday?.rest)) && (
            <p className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full bg-surface px-3 py-1 text-sm text-ink-soft ring-1 ring-rule">
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
        </div>
      </header>

      {/* ---------- Tier 1: Now ---------- */}
      <section aria-label="עכשיו" className="min-w-0 space-y-4 md:col-start-1 md:row-start-2">
        <BadgeToast earned={earned} />

        {isOff && supabaseEnabled && <DayOff date={today} isOff sessionsToday={0} routinesToday={0} />}

        {meetupOn && (
          <Suspense fallback={null}>
            <MeetupBanner
              code={meetupOn.event.course_code!}
              short={themeOf(courses, meetupOn.event.course_code!).short}
              date={today}
              start={meetupOn.event.start_time!}
              end={meetupOn.event.end_time}
              phase={meetupOn.phase}
              nowMin={nowMin}
            />
          </Suspense>
        )}

        {courses.length > 0 && (
          <UpNext
            nowMin={nowMin}
            item={upNext}
            unmarked={pastUnmarked.length}
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

        {/* The rest of today, in time order. Past sessions nobody marked ask to be marked. */}
        {(dayRows.length > 0 || week.length > 0 || !upNext) && (
        <div className="panel overflow-hidden">
          {(dayRows.length > 0 || !upNext) && (
          <div className="flex items-baseline justify-between gap-3 px-4 pt-3 sm:px-5">
            <h2 className="text-sm font-semibold">{dayRows.length ? "עוד היום" : "היום"}</h2>
            {pastUnmarked.length > 0 && (
              <span className="text-xs">
                <span className="hl">{pastUnmarked.length === 1 ? "מפגש אחד מחכה לסימון" : `${pastUnmarked.length} מפגשים מחכים לסימון`}</span>
              </span>
            )}
          </div>
          )}
          {dayRows.length > 0 ? (
            <ol className="mt-1 divide-y divide-rule">
              {dayRows.map((r) =>
                r.kind === "event" ? (
                  <EventRow key={`e${r.e.id}`} e={r.e} courses={courses} prep={r.e.kind === "tutorial" && !r.e.cancelled ? weekOf(r.e.course_code, r.e.date) : null} past={!!r.e.end_time && mins(r.e.end_time) <= nowMin} />
                ) : (
                  <SessionRow
                    key={`s${r.x.start}`}
                    x={r.x}
                    status={status[sessionKey(r.x)]}
                    past={mins(r.x.end) <= nowMin}
                    courses={courses}
                    reading={reading}
                    assignmentPlans={plans.assignments}
                    editable={canEdit}
                  />
                ),
              )}
            </ol>
          ) : upNext ? null : (
            <p className="px-4 pb-4 pt-1 text-sm text-ink-soft sm:px-5">
              {todaySessions.length || todayEvents.length
                ? "זה הכל להיום."
                : week.length
                  ? `אין לימוד היום. המפגש הבא: ${formatHebrewDate(week[0][0], { weekday: "long" })}.`
                  : "אין לימוד מתוכנן היום."}
            </p>
          )}
          {week.length > 0 && (
            <details className={`group ${dayRows.length > 0 || !upNext ? "border-t border-rule" : ""}`}>
              <summary className="summary-clean flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm text-ink-soft hover:text-ink sm:px-5">
                <span className="flex-1">שאר השבוע ({weekRest === 1 ? "מפגש אחד" : `${weekRest} מפגשים`})</span>
                <Chevron />
              </summary>
              <ul className="divide-y divide-rule border-t border-rule">
                {week.map(([day, list]) => (
                  <li key={day} className="flex gap-4 px-4 py-3 sm:px-5">
                    <span className="w-14 shrink-0 text-sm text-ink-soft">
                      {formatHebrewDate(day, { weekday: "short" })} {formatHebrewDate(day, { day: "numeric", month: "numeric" })}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                      {[...list].sort((a, b) => a.start.localeCompare(b.start)).map((x) => (
                        <span key={x.start} className="flex items-center gap-2">
                          <span className="size-2 shrink-0 rounded-full" style={{ background: themeOf(courses, x.courseCode).color }} />
                          <span className="truncate">{x.title}</span>
                          <span className="ms-auto shrink-0 tabular-nums text-ink-soft">{range(x.start, x.end)}</span>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        )}

        {plan.warnings.length > 0 && (
          <details className="group text-sm">
            <summary className="summary-clean flex min-h-10 items-center gap-2">
              <Icon name="alert" className="size-4 text-ink-soft" />
              <span className="hl">
                חסרות {duration(plan.warnings.reduce((n, w) => n + w.missingMinutes, 0))} לימוד לפני {plan.warnings.length}{" "}
                {plan.warnings.length === 1 ? "מטלה" : "מטלות"}
              </span>
              <span className="text-ink-soft group-open:hidden">פירוט</span>
              <Chevron className="size-4" />
            </summary>
            <ul className="mt-2 space-y-1 ps-7 text-ink-soft">
              {plan.warnings.map((w) => {
                const c = courses.find((x) => x.code === w.courseCode);
                // Too late to fit it in: offer a ready-made extension request to the course coordinator.
                const tight = w.missingMinutes >= 120;
                const body = `שלום${c?.coordinator ? ` ${c.coordinator}` : ""},\n\nאני סטודנט/ית בקורס ${c?.name ?? ""} (${w.courseCode}) בסמסטר ${semester.semester}.\nאבקש הארכה בהגשת ${w.title}, בגלל ___.\nאשמח לדעת אם זה אפשרי ועד מתי.\n\nתודה רבה,\n${profile?.name ?? ""}`;
                return (
                  <li key={w.title}>
                    {w.title}: חסרות {duration(w.missingMinutes)}
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
            <Link href="/settings#study" className="btn-ghost mt-1 ms-5">
              הוספת זמני לימוד
            </Link>
          </details>
        )}

        {courses.length > 0 && (
          <Suspense fallback={null}>
            <DayCheckCard today={today} nowMin={nowMin} />
          </Suspense>
        )}

        {show("weekstrip") && <WeekStrip days={strip} today={today} goal={profile?.weekly_goal_minutes ?? null} />}
      </section>

      {/* ---------- Tier 2: This week ---------- */}
      <section aria-labelledby="soon-title" className="min-w-0 space-y-6 md:col-start-2 md:row-span-2 md:row-start-2">
        {show("deadlines") && (
          <div>
            <h2 id="soon-title" className="section-title mb-3">
              הגשות קרובות
            </h2>
            <div className="panel overflow-hidden">
              <DeadlineList
                rows={soon.map(toRow)}
                editable={supabaseEnabled}
                empty={next ? <>אין הגשות בשבועיים הקרובים. זמן טוב להתקדם בחומר.</> : <>כל המטלות של הסמסטר מאחוריך.</>}
              />
              {later.length > 0 && (
                <details className="group border-t border-rule">
                  <summary className="summary-clean flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm text-ink-soft hover:text-ink sm:px-5">
                    <span className="flex-1">
                      אחר כך: {later.length} הגשות, הבאה ב־{formatHebrewDate(later[0].due, { day: "numeric", month: "numeric" })}
                    </span>
                    <Chevron />
                  </summary>
                  <div className="border-t border-rule">
                    <DeadlineList rows={later.map(toRow)} editable={supabaseEnabled} empty={null} />
                    <Link href="/semester" className="btn-ghost mx-2 mb-2">
                      כל המטלות בלוח
                      <Chevron dir="forward" />
                    </Link>
                  </div>
                </details>
              )}
            </div>
          </div>
        )}

        {show("reading") && courses.some((c) => plans.weeks[c.code] || reading[c.code]) && (
          <div>
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
                      <CourseChip short={themeOf(courses, c.code).short} color={themeOf(courses, c.code).color} className="font-medium" />
                      {w && (
                        <p className="mt-0.5 text-sm text-ink-soft">
                          {before ? `שבוע ${w.ref} (מ־${formatHebrewDate(w.starts!, { day: "numeric", month: "numeric" })})` : `שבוע ${w.ref}`}: <MathText text={w.label} />
                          {w.estimated ? " · הצעה" : ""}
                        </p>
                      )}
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

        {show("exams") && <ExamCountdown today={today} upcoming={upcomingExams} courses={courses} />}

        {show("standings") && courses.length > 0 && (
          <div>
            <h2 id="courses-title" className="section-title mb-3">
              מצב בקורסים
            </h2>
            <ul className="panel divide-y divide-rule overflow-hidden">
              {courses.map((c) => {
                const theme = themeOf(courses, c.code);
                const st = standing(c, progress, today);
                const s = standingSentence(st, c.assignmentWeight.min, c.assignmentWeight.max);
                return (
                  <li key={c.code}>
                    <Link href={`/courses/${c.code}`} className="block px-4 py-3 hover:bg-bg">
                      <span className="flex items-center gap-2">
                        <CourseChip short={theme.short} color={theme.color} className="flex-1 font-medium" />
                        <span className="text-xs tabular-nums text-ink-soft">
                          {st.earned} מתוך {c.assignmentWeight.min} נק׳
                        </span>
                      </span>
                      <MiniBar earned={st.earned} min={c.assignmentWeight.min} max={c.assignmentWeight.max} color={theme.color} />
                      <span className={`mt-1 block text-xs leading-snug ${s.warn ? "" : "text-ink-soft"}`}>
                        <span className={s.warn ? "hl" : undefined}>{s.text}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* ---------- Tier 3: everything else, slim ---------- */}
      <section aria-label="עוד" className="min-w-0 space-y-4 md:col-start-1 md:row-start-3">
        {supabaseEnabled && sleepIn && <SleepInCard s={sleepIn} />}

        {invites.length > 0 && <InvitesList invites={invites} names={inviters} />}

        {updates.length > 0 && <UpdatesList updates={updates} />}

        <PracticeMarksCard />
        <ExamCandidates />

        {show("live") && (
          <StudyingNow
            rows={live.map((l) => ({
              user_id: l.user_id,
              name: inviters[l.user_id]?.name ?? "חבר/ה",
              avatar_url: inviters[l.user_id]?.avatar_url ?? null,
              avatar_emoji: inviters[l.user_id]?.avatar_emoji,
              avatar_color: inviters[l.user_id]?.avatar_color,
              title: l.title,
              ends_at: l.ends_at,
            }))}
          />
        )}

        {!show("routines") ? null : todayRoutines.length > 0 ? (
          <TodayRoutines items={todayRoutines} date={today} />
        ) : (
          <Link href="/routines" className="panel flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm hover:border-ink-soft">
            <Icon name="repeat" className="size-4 text-ink-soft" />
            <span className="flex-1">הוספת שגרה: שינה, ארוחות, ספורט</span>
            <Chevron dir="forward" />
          </Link>
        )}

        <FirstSteps
          steps={[
            { label: "להוסיף את הקורסים של הסמסטר", href: "/courses", done: courses.length > 0 },
            { label: "להוסיף שגרה: שינה, ארוחות, ספורט", href: "/routines", done: routines.length > 0 },
            { label: "להפעיל התראות בטלפון", href: "/settings#notify", done: hasPush },
          ]}
        />

        <ExamCandidates />

        {show("forums") && forumNew.length > 0 && (
          <Fold id="today-forums" title="חדש בפורומים" summary={`${forumNew.length} הודעות חדשות`} defaultOpen={false}>
            <ul className="-mx-4 -my-3 divide-y divide-rule sm:-mx-5">
              {forumNew.map((f) => (
                <li key={f.mailId}>
                  <Link href={`/mail?open=${f.mailId}`} className="flex items-start gap-3 px-4 py-3 hover:bg-bg sm:px-5">
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
          </Fold>
        )}

        {supabaseEnabled && show("quickadd") && (
          <Fold id="today-quickadd" title="הוספה מהירה" summary="אירוע בשורה אחת, למשל ״אימון מחר 18:00״" defaultOpen={false}>
            <QuickAdd today={today} people={connected} />
          </Fold>
        )}

        {/* small actions, one line */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {supabaseEnabled && show("dayoff") && !isOff && (
            <DayOff
              date={today}
              isOff={false}
              sessionsToday={todaySessions.filter((x) => !status[sessionKey(x)]).length}
              routinesToday={todayRoutines.filter((o) => !o.done && o.category !== "meal").length}
            />
          )}
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
        </div>
      </section>
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

type TodayEvent = Awaited<ReturnType<typeof getUserPlan>>["events"][number];
type DayRow = { kind: "event"; start: string; e: TodayEvent } | { kind: "session"; start: string; x: Session };

function EventRow({ e, courses, prep, past }: { e: TodayEvent; courses: Course[]; prep: ReadingItem | null; past: boolean }) {
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:px-5 ${e.cancelled ? "text-ink-soft line-through" : past ? "text-ink-soft" : ""}`}>
      <span className="w-11 shrink-0 text-center font-medium tabular-nums">{e.start_time ? range(e.start_time) : "כל היום"}</span>
      <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: e.course_code ? themeOf(courses, e.course_code).color : "var(--ink-soft)" }} aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        {e.cancelled ? "בוטל: " : ""}
        {e.title}
        {e.location && <span className="text-ink-soft"> · {e.location}</span>}
      </span>
      {e.end_time && <span className="shrink-0 text-xs text-ink-soft">עד {range(e.end_time)}</span>}
      {prep?.links.length ? (
        <span className="basis-full ps-[3.75rem] text-xs text-ink-soft">
          לקראת המפגש: <MathText text={prep.label} />
          <ReadChips links={prep.links} className="mt-1" />
        </span>
      ) : null}
    </li>
  );
}

function SessionRow({
  x,
  status,
  past,
  courses,
  reading,
  assignmentPlans,
  editable,
}: {
  x: Session;
  status?: "done" | "skipped";
  past: boolean;
  courses: Course[];
  reading: Record<string, Reading>;
  assignmentPlans: Record<string, Record<string, ReadingItem>>;
  editable: boolean;
}) {
  const ask = past && !status;
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5 ${ask ? "bg-highlight/10" : ""}`}>
      <div className="w-11 shrink-0 text-center leading-tight tabular-nums">
        <div className={`text-[17px] font-semibold ${status ? "text-ink-soft" : ""}`}>{range(x.start)}</div>
        <div className="text-[11px] text-ink-soft">{durationShort(x.minutes)}</div>
      </div>
      <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: themeOf(courses, x.courseCode).color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className={`truncate font-medium ${status ? "text-ink-soft line-through decoration-rule-strong" : ""}`}>{x.title}</div>
        <div className="text-xs text-ink-soft">
          {!ask && x.fromCode ? `במקום ${themeOf(courses, x.fromCode).short} · ` : !ask && x.moved ? "הוזז ידנית · " : ""}{ask ? "עבר. בוצע או דולג?" : x.kind === "assignment" ? `הכנה למטלה, עד ${range(x.end)}` : x.kind === "exam" ? `חזרה לבחינה, עד ${range(x.end)}` : x.why ? `יותר זמן כאן: ${x.why}. עד ${range(x.end)}` : `עד ${range(x.end)}`}
        </div>
        {!status && !ask && (x.kind === "assignment" && x.ref && assignmentPlans[x.courseCode]?.[baseRef(x.ref).replace(/^a/, "")] ? (
          <ReadChips links={assignmentPlans[x.courseCode][baseRef(x.ref).replace(/^a/, "")].links} className="mt-1" />
        ) : x.courseCode && reading[x.courseCode] ? (
          <Link href={reading[x.courseCode].href} className="mt-0.5 flex items-center gap-1 text-xs text-ink-soft hover:text-ink">
            <Icon name="book" className="size-3.5 shrink-0" />
            <span className="truncate underline decoration-rule underline-offset-2">{reading[x.courseCode].title}</span>
          </Link>
        ) : null)}
        {!status && !ask && <SessionAgendaFor session={x} />}
      </div>
      {editable && (
        // a past session's two buttons get their own line on the phone, so the title stays readable
        <div className={`flex items-center gap-1 ${ask ? "max-sm:basis-full max-sm:ps-[4.75rem]" : ""}`}>
          {!status && !past && (
            <SessionMoveButton
              sessionKey={x.moveKey ?? sessionKey(x)}
              title={x.title}
              date={x.date}
              start={x.start}
              minutes={x.minutes}
              moved={!!x.moved}
              today={x.date}
              courseCode={x.courseCode}
              courses={courses.map((c) => ({ code: c.code, short: themeOf(courses, c.code).short, color: themeOf(courses, c.code).color }))}
            />
          )}
          <SessionToggle sessionKey={sessionKey(x)} status={status} minutes={x.minutes} title={x.title} courseCode={x.courseCode} past={past} />
        </div>
      )}
    </li>
  );
}

/** Sunday to Saturday: study done vs planned per day. Tapping a day opens it in the calendar. */
function WeekStrip({ days, today, goal }: { days: { d: string; planned: number; done: number }[]; today: string; goal: number | null }) {
  const top = Math.max(60, ...days.map((x) => Math.max(x.planned, x.done)));
  const done = days.reduce((n, x) => n + x.done, 0);
  const planned = days.filter((x) => x.d >= today).reduce((n, x) => n + Math.max(0, x.planned - (x.d === today ? x.done : 0)), 0);
  return (
    <section aria-labelledby="strip-title" className="panel px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="strip-title" className="text-sm font-semibold">
          השבוע שלי <span className="font-normal text-ink-soft">(שעות)</span>
        </h2>
        <p className="text-xs text-ink-soft">
          {durationShort(done)} נעשו · {durationShort(planned)} עוד בתוכנית{goal ? ` · יעד ${durationShort(goal)}` : ""} ·{" "}
          <Link href="/log" className="underline decoration-rule underline-offset-4 hover:text-ink">
            יומן שעות
          </Link>
        </p>
      </div>
      <ol className="mt-2 grid grid-cols-7 gap-1.5">
        {days.map(({ d, planned: p, done: dn }) => {
          const isToday = d === today;
          const past = d < today;
          const h = (m: number) => `${Math.round((m / top) * 100)}%`;
          return (
            <li key={d}>
              <Link
                href={`/semester?d=${d}`}
                className={`flex flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] hover:bg-bg ${isToday ? "ring-1 ring-ink" : ""}`}
                aria-label={`${formatHebrewDate(d, { weekday: "long" })}: ${dn ? `${duration(dn)} לימוד` : "בלי לימוד שסומן"}${p && !past ? `, ${duration(p)} בתוכנית` : ""}`}
              >
                <span className={isToday ? "font-semibold" : "text-ink-soft"}>{formatHebrewDate(d, { weekday: "narrow" })}</span>
                <span className="relative h-12 w-3 overflow-hidden rounded-full bg-rule" aria-hidden>
                  {!past && p > 0 && <span className="absolute inset-x-0 bottom-0 rounded-full border border-dashed border-rule-strong" style={{ height: h(p) }} />}
                  {dn > 0 && <span className="absolute inset-x-0 bottom-0 rounded-full bg-ink" style={{ height: h(Math.min(dn, top)) }} />}
                </span>
                <span className="tabular-nums text-ink-soft">{dn ? hours(dn) : past ? "–" : p ? hours(p) : "\u00a0"}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** 90 → "1.5", 45 → "0.8": hours with one decimal, for the narrow strip (its heading says "שעות"). */
const hours = (m: number) => (m / 60).toFixed(1).replace(/\.0$/, "");

/** Assignment points so far, with a tick at the course minimum. */
function MiniBar({ earned, min, max, color }: { earned: number; min: number; max: number; color: string }) {
  const pct = (v: number) => `${Math.min(100, (v / Math.max(1, max)) * 100)}%`;
  return (
    <span className="relative mt-2 block h-1.5 rounded-full bg-rule" aria-hidden>
      <span className="absolute inset-y-0 start-0 rounded-full" style={{ width: pct(earned), background: color }} />
      <span className="absolute -inset-y-1 w-0.5 rounded-full bg-ink" style={{ insetInlineStart: pct(min) }} title="המינימום" />
    </span>
  );
}

const REVISION_DAYS = 21;

function ExamCountdown({ today, upcoming, courses }: { today: string; upcoming: ReturnType<typeof nextExams>; courses: Course[] }) {
  if (upcoming.length === 0)
    return (
      <Link href="/settings#study" className="panel flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm hover:border-ink-soft">
        <Icon name="calendar" className="size-4 text-ink-soft" />
        <span className="flex-1">מועדי הבחינות: להוסיף כשמתפרסמים</span>
        <Chevron dir="forward" />
      </Link>
    );
  return (
    <div>
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
                  <CourseChip short={themeOf(courses, e.course_code).short} color={themeOf(courses, e.course_code).color} title={course?.name} />
                </div>
                <div className="text-xs text-ink-soft">
                  מועד {e.moed}, {formatHebrewDate(e.date, { day: "numeric", month: "long" })}
                  {e.start_time ? ` ב־${range(e.start_time)}` : ""}
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
