import { range } from "@/lib/time";
import { duration } from "@/lib/time";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Tabs } from "@/components/Fold";
import { Icon } from "@/components/Icon";
import { ReadChips } from "@/components/ReadChips";
import { MathText } from "@/components/MathText";
import { VideoStrip } from "@/components/VideoStrip";
import { StuckList } from "@/components/StuckList";
import { QuestionsForTutor } from "@/components/QuestionsForTutor";
import { examLines, meetupHref, questionLines } from "@/lib/meetup";
import { AssignmentChecklist } from "@/components/AssignmentChecklist";
import { GradeCalculator } from "@/components/GradeCalculator";
import { ruleHe, StandingText, WeightBar } from "@/components/CourseParts";
import { CourseLook } from "@/components/CourseManager";
import { PALETTE } from "@/lib/semester";
import { ExamDates, ExamNag } from "@/components/ExamDates";
import { PastExamBank } from "@/components/PastExamBank";
import { AssignmentQuestions } from "@/components/AssignmentQuestions";
import { StrategyPanel } from "@/components/Strategy";
import { aimedExam, attemptScore, getMockAttempts, getPastExams, runway, semesterEnd, type Runway } from "@/lib/exams";
import { getChecks, getQuestions } from "@/lib/trackerData";
import { courseStrategy, crunches as findCrunches, freeMinutes } from "@/lib/strategy";
import { busyFromEvents } from "@/lib/planfor";
import { getBooks, readingByCourse } from "@/lib/books";
import { getReadings, weekFor, type ReadingItem } from "@/lib/readings";
import { getForumPosts } from "@/lib/forum";
import { getCourseVideos, type VideoTopic } from "@/lib/videos";
import { courseHours } from "@/lib/courseHours";
import { MOCK_TITLE, prepMinutes, sessionKey, type Exam, type Session } from "@/lib/planner";
import { progressKey, standing } from "@/lib/progress";
import { getNotes, getReviews, getSessionRows, getSpentByAssignment, getStuck, getUserPlan, type UserEvent } from "@/lib/userdata";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { addDays, daysBetween, formatHebrewDate, semester, todayInIsrael, typeLabel } from "@/lib/semester";

export default function CoursePage({ params }: PageProps<"/courses/[code]">) {
  return (
    <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
      <Course params={params} />
    </Suspense>
  );
}

const hrs = (m: number) => duration(m);
const day = (d: string) => formatHebrewDate(d, { weekday: "short", day: "numeric", month: "numeric" });

async function Course({ params }: Pick<PageProps<"/courses/[code]">, "params">) {
  await connection();
  const { code } = await params;
  const today = todayInIsrael();
  const [{ progress, plan, events, status, courses, exams, prefs, offDays }, rows, books, forum, stuck, notes, spent, reviews, pastExams, questions, checks] = await Promise.all([
    getUserPlan(today),
    getSessionRows(),
    getBooks(),
    getForumPosts(),
    getStuck(),
    getNotes(),
    getSpentByAssignment(),
    getReviews(),
    getPastExams(code),
    getQuestions(code),
    getChecks(code),
  ]);
  const c = courses.find((x) => x.code === code);
  if (!c) notFound();
  const [plans, videos, cardsDue, attempts] = await Promise.all([getReadings(books), getCourseVideos(code, books), dueCards(code), getMockAttempts(pastExams.map((e) => e.id))]);
  const myBooks = books.filter((b) => b.course_code === code).sort((a, b) => a.position - b.position);
  const weeks = plans.weeks[code] ?? [];
  const thisWeek = weekFor(weeks, today);
  const reading = readingByCourse(myBooks)[code];
  const hours = courseHours({ course: c, plan, rows, progress, today });
  const st = standing(c, progress, today);

  const meetups = events
    .filter((e) => e.course_code === code && (e.kind === "tutorial" || e.kind === "other") && e.start_time)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  const tutorials = meetups.filter((e) => e.kind === "tutorial");
  const nextMeetup = tutorials.find((e) => e.date >= today && !e.cancelled);
  const nextDue = c.assignments
    .filter((a) => a.due >= today && !["submitted", "skipped"].includes(progress[progressKey(code, a.n)]?.status ?? ""))
    .sort((a, b) => a.due.localeCompare(b.due))[0];
  const myExams = exams.filter((e) => e.course_code === code);
  const exam = aimedExam(exams, code, today);
  const run = exam ? runway(plan.sessions, code, exam, today) : null;
  const mySpent = Object.fromEntries(Object.entries(spent).filter(([k]) => k.startsWith(code + "|")).map(([k, v]) => [k.split("|")[1], v]));
  const strategy = courseStrategy({ course: c, progress, today, prep: prepMinutes, spent: mySpent });
  const crunchList = findCrunches({ courses, progress, today, prep: prepMinutes, spent, free: freeMinutes(prefs, offDays, busyFromEvents(events)) }).filter(
    (k) => k.items.some((i) => i.code === code) && k.last >= today && k.first <= addDays(today, 60),
  );
  const strategyAlert = strategy.lines.find((l) => l.tone === "warn") ?? crunchList.find((k) => k.tone === "warn" && k.from <= addDays(today, 7));
  const bank = pastExams.map((e) => {
    const mine = attempts.filter((a) => a.exam_id === e.id && a.finished_at);
    return { id: e.id, label: e.label, url: e.url, duration_minutes: e.duration_minutes, questions: e.questions, attempts: mine.length, lastScore: mine[0] ? attemptScore(mine[0]) : null };
  });
  const tracked = c.assignments
    .filter((a) => a.type === "file" && a.due >= today && !["submitted", "skipped"].includes(progress[progressKey(code, a.n)]?.status ?? ""))
    .map((a) => ({
      n: a.n,
      label: `${typeLabel[a.type]} ${a.n}`,
      dueLabel: formatHebrewDate(a.due, { day: "numeric", month: "numeric" }),
      daysLeft: daysBetween(today, a.due),
      questions: questions[a.n] ?? [],
      checks: checks[a.n] ?? [],
    }));
  const upcoming = plan.sessions.filter((s) => s.courseCode === code && s.date >= today && s.date <= addDays(today, 13));
  const courseForum = forum.filter((f) => f.courseCode === code);
  const myStuck = stuck.filter((x) => x.course_code === code);
  const myNotes = notes.filter((n) => n.course_code === code);
  const watchedCount = videos.reduce((n, t) => n + t.videos.filter((v) => v.watched).length, 0);
  const videoCount = videos.reduce((n, t) => n + t.videos.length, 0);

  return (
    <article style={{ ["--course" as string]: c.color }}>
      <Link href="/courses" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <Icon name="chevronRight" className="size-4" />
        כל הקורסים
      </Link>

      <header className="mt-3">
        <p className="text-sm text-ink-soft">
          {c.code} · מרכז ההוראה {c.coordinator}
        </p>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">{c.name}</h1>
        <SemesterStrip weeks={weeks} meetups={tutorials} today={today} color={c.color} />
      </header>
      {!myExams.length && <ExamNag code={code} editable={supabaseEnabled} />}

      <dl className="panel mt-6 grid grid-cols-2 divide-rule overflow-hidden sm:grid-cols-4 sm:divide-x sm:divide-x-reverse [&>div]:border-rule [&>div]:p-4 max-sm:[&>div:nth-child(odd)]:border-e max-sm:[&>div:nth-child(-n+2)]:border-b">
        <Fact label="המפגש הבא" value={nextMeetup ? day(nextMeetup.date) : "אין"} sub={nextMeetup ? range(nextMeetup.start_time, nextMeetup.end_time) : undefined} />
        <Fact
          label="ההגשה הבאה"
          value={nextDue ? `${typeLabel[nextDue.type]} ${nextDue.n}` : "אין"}
          sub={nextDue ? `${day(nextDue.due)} · ${relDays(daysBetween(today, nextDue.due))}` : undefined}
        />
        <Fact label="השבוע" value={`${hrs(hours.weekDone)} נלמדו`} sub={hours.weekPlanned ? `ועוד ${hrs(hours.weekPlanned)} מתוכננות` : "אין עוד לימוד מתוכנן השבוע"} />
        <Fact
          label="שעות חסרות"
          value={hours.missing ? hrs(hours.missing) : "אין"}
          sub={hours.missing ? "הכנה למטלות שאין לה מקום בתוכנית" : "התוכנית מכסה את ההכנה למטלות"}
          alert={hours.missing > 0}
        />
      </dl>

      <div className="mt-8">
        <Tabs
          id={`course-${code}`}
          tabs={[
            {
              key: "overview",
              label: "סקירה",
              panel: (
                <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                  <div className="space-y-6">
                    <section className="panel p-5">
                      <h2 className="section-title">{thisWeek ? `לקריאה השבוע · ${thisWeek.label}` : "לקריאה השבוע"}</h2>
                      {thisWeek ? <ReadChips links={thisWeek.links} className="mt-3" /> : <p className="mt-2 text-sm text-ink-soft">עוד אין תוכנית קריאה לקורס.</p>}
                      {reading && (
                        <Link href={reading.href} className="mt-4 flex items-center gap-2 text-sm text-ink-soft hover:text-ink">
                          <Icon name="bookmark" className="size-4" />
                          <span>
                            להמשיך לקרוא: <MathText text={reading.title} />
                            {reading.lastPage ? `, עמוד ${reading.lastPage} מתוך ${reading.pages}` : ""}
                          </span>
                        </Link>
                      )}
                    </section>

                    <section className="panel overflow-hidden">
                      <div className="flex items-baseline justify-between px-5 pt-5">
                        <h2 className="section-title">הלימוד המתוכנן</h2>
                        <Link href="/semester" className="text-sm text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
                          ללוח השנה
                        </Link>
                      </div>
                      <SessionRows sessions={upcoming} status={status} />
                    </section>

                    <HoursPanel hours={hours} />
                  </div>

                  <aside className="space-y-6">
                    <section className="panel p-5">
                      <h2 className="section-title">מצב במטלות</h2>
                      <WeightBar course={c} st={st} color={c.color} />
                      <StandingText st={st} min={c.assignmentWeight.min} max={c.assignmentWeight.max} />
                      {strategyAlert && <p className="mt-2 text-sm leading-relaxed">{strategyAlert.text}</p>}
                    </section>
                    <ExamCard exam={exam} run={run} today={today} code={code} hasRows={myExams.length > 0} />
                    <section className="panel p-5">
                      <h2 className="section-title">ספרי הקורס</h2>
                      <ul className="mt-3 space-y-3">
                        {myBooks.map((b) => {
                          const real = b.chapters.filter((x) => x.idx > 0 && x.end_page - x.start_page >= 4);
                          const done = real.filter((x) => x.done_at).length;
                          return (
                            <li key={b.id}>
                              <Link href={`/books/${b.id}`} className="flex items-baseline justify-between gap-3 hover:underline">
                                <span>{b.title}</span>
                                <span className="shrink-0 text-xs tabular-nums text-ink-soft">
                                  {done}/{real.length} פרקים
                                </span>
                              </Link>
                              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-rule">
                                <span className="block h-full" style={{ width: `${real.length ? (done / real.length) * 100 : 0}%`, background: c.color }} />
                              </span>
                            </li>
                          );
                        })}
                        {!myBooks.length && <li className="text-sm text-ink-soft">הספרים עוד לא יובאו.</li>}
                      </ul>
                    </section>
                    {cardsDue > 0 && (
                      <Link href="/study" className="panel flex items-center gap-3 p-4 hover:bg-bg">
                        <Icon name="bulb" className="size-5 text-ink-soft" />
                        <span className="flex-1 text-sm">
                          <b>{cardsDue}</b> כרטיסיות לחזרה בקורס הזה
                        </span>
                        <Icon name="chevronLeft" className="size-4 text-ink-soft" />
                      </Link>
                    )}
                  </aside>
                </div>
              ),
            },
            {
              key: "chapters",
              label: "פרקים וסרטונים",
              badge: undefined,
              panel: <ChapterTrack topics={videos} weeks={weeks} today={today} watched={watchedCount} total={videoCount} color={c.color} />,
            },
            {
              key: "assignments",
              label: "מטלות",
              panel: (
                <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
                  <div className="space-y-6">
                  <section className="panel px-5 pb-2 pt-5">
                    <h2 className="section-title">מטלות הקורס</h2>
                    <AssignmentChecklist
                      code={code}
                      color={c.color}
                      editable={supabaseEnabled}
                      items={c.assignments.map((a) => ({
                        n: a.n,
                        reading: plans.assignments[code]?.[a.n] ?? null,
                        forum: courseForum.filter((f) => f.assignment === a.n).slice(0, 3).map((f) => ({ topic: f.topic, href: `/mail?open=${f.mailId}` })),
                        label: `${typeLabel[a.type]} ${a.n}`,
                        due: formatHebrewDate(a.due, { day: "numeric", month: "numeric" }) + (a.originalDue ? " (הוארך)" : ""),
                        weight: a.weight,
                        past: a.due < today,
                        progress: progress[progressKey(code, a.n)] ?? { status: "todo", grade: null },
                        spent: spent[`${code}|${a.n}`],
                        review: reviews.find((r) => r.course_code === code && r.n === a.n) ?? null,
                      }))}
                    />
                  </section>
                  <section className="panel px-5 pb-2 pt-5">
                    <h2 className="section-title">איפה אני בממ״נים</h2>
                    <p className="mt-1 text-sm text-ink-soft">שאלה אחר שאלה. יומיים לפני ההגשה מופיעה רשימת בדיקה.</p>
                    <AssignmentQuestions code={code} color={c.color} items={tracked} editable={supabaseEnabled} />
                  </section>
                  </div>
                  <div className="space-y-6">
                  <StrategyPanel s={strategy} crunches={crunchList} color={c.color} />
                  <section className="panel overflow-hidden">
                    <GradeCalculator
                      color={c.color}
                      max={c.assignmentWeight.max}
                      rows={c.assignments.map((a) => {
                        const p = progress[progressKey(code, a.n)];
                        return { n: a.n, label: `${typeLabel[a.type]} ${a.n}`, weight: a.weight, grade: p?.status === "submitted" ? (p.grade ?? null) : null, status: p?.status ?? "todo" };
                      })}
                    />
                  </section>
                  </div>
                </div>
              ),
            },
            {
              key: "exams",
              label: "בחינות",
              panel: (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="space-y-6">
                    <section className="panel p-5">
                      <h2 className="section-title">מועדי הבחינה</h2>
                      <p className="mt-1 text-sm text-ink-soft">
                        {myExams.length ? "מהשאילתא. אפשר לשנות בכל רגע." : "מועדי הבחינות עוד לא פורסמו. כשיתפרסמו בשאילתא, הזינו אותם כאן."}
                      </p>
                      <div className="mt-4">
                        <ExamDates code={code} exams={myExams} editable={supabaseEnabled} />
                      </div>
                    </section>
                    <RunwayPanel exam={exam} run={run} today={today} status={status} />
                  </div>
                  <section className="panel self-start p-5">
                    <h2 className="section-title">בחינות קודמות</h2>
                    <p className="mt-1 mb-3 text-sm text-ink-soft">הבחינות באוניברסיטה הפתוחה חוזרות על עצמן. לפתור אותן בזמן אמת זו ההכנה הכי טובה.</p>
                    <PastExamBank code={code} rows={bank} editable={supabaseEnabled} />
                  </section>
                </div>
              ),
            },
            {
              key: "meetups",
              label: "מפגשים",
              panel: (
                <div className="space-y-6">
                  <Meetups meetups={meetups} weeks={weeks} today={today} code={code} />
                  <Suspense fallback={null}>
                    <QuestionsForTutor courseCode={code} courseName={c.name} />
                  </Suspense>
                </div>
              ),
            },
            {
              key: "more",
              label: "פורום וקישורים",
              badge: courseForum.filter((f) => !f.isRead).length || undefined,
              panel: (
                <div className="grid items-start gap-6 lg:grid-cols-2">
                  <section className="panel p-5">
                    <h2 className="section-title">מהפורומים</h2>
                    {courseForum.length ? (
                      <ul className="mt-3 space-y-3 text-sm">
                        {courseForum.slice(0, 12).map((f) => (
                          <li key={f.mailId}>
                            <Link href={`/mail?open=${f.mailId}`} className="block hover:underline">
                              <span className={f.isRead ? "" : "font-semibold"}>{f.topic}</span>
                              <span className="block text-xs text-ink-soft">
                                {f.forum} · {f.author ?? ""} · {formatHebrewDate(f.at.slice(0, 10), { day: "numeric", month: "numeric" })}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-ink-soft">עוד אין הודעות מהפורומים של הקורס.</p>
                    )}
                  </section>
                  <div className="space-y-6">
                    {myStuck.length > 0 && (
                      <section className="panel overflow-hidden">
                        <StuckList items={myStuck} />
                      </section>
                    )}
                    <section className="panel p-5">
                      <h2 className="section-title">סיכומים מ־Notability</h2>
                      {myNotes.length ? (
                        <ul className="mt-3 space-y-2 text-sm">
                          {myNotes.slice(0, 10).map((n) => (
                            <li key={n.id}>
                              {n.url ? (
                                <a href={n.url} target="_blank" rel="noreferrer" className="hover:underline">
                                  {n.name}
                                </a>
                              ) : (
                                n.name
                              )}
                              {n.summary && <span className="block text-xs text-ink-soft">{n.summary}</span>}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-ink-soft">אין עדיין סיכומים מקושרים לקורס.</p>
                      )}
                    </section>
                    <section className="panel p-5 text-sm">
                      <h2 className="section-title">קישורים</h2>
                      <ul className="mt-3 space-y-2">
                        <li>
                          <a className="underline decoration-rule underline-offset-4 hover:text-ink" href={c.opalId ? `https://opal.openu.ac.il/course/view.php?id=${c.opalId}` : "https://opal.openu.ac.il/my/"} target="_blank" rel="noreferrer">
                            אתר הקורס באופל
                          </a>
                        </li>
                        <li>
                          <a className="underline decoration-rule underline-offset-4 hover:text-ink" href={`https://academic.openu.ac.il/course-requirements/course/${code}/semester/${encodeURIComponent(semester.semester)}`} target="_blank" rel="noreferrer">
                            דרישות הקורס
                          </a>
                        </li>
                        <li>
                          <Link className="underline decoration-rule underline-offset-4 hover:text-ink" href={`/books?course=${code}`}>
                            חיפוש בספרי הקורס
                          </Link>
                        </li>
                      </ul>
                      {(c.rules?.length || c.finalAssessment) && (
                        <div className="mt-4 border-t border-rule pt-3 text-ink-soft">
                          {c.finalAssessment && <p>הערכה מסכמת: {c.finalAssessment}</p>}
                          {c.rules?.length ? (
                            <ul className="mt-1 list-disc space-y-1 ps-5">
                              {c.rules.map((r) => (
                                <li key={r}>{ruleHe[r] ?? r}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      )}
                      <CourseLook code={code} short={c.short} color={Object.entries(PALETTE).find(([, v]) => v.css === c.color)?.[0] ?? "slate"} />
                    </section>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </div>
    </article>
  );
}

async function dueCards(code: string): Promise<number> {
  if (!supabaseEnabled) return 0;
  const sb = await createClient();
  const { count } = await sb.from("cards").select("id", { count: "exact", head: true }).eq("course_code", code).lte("due_at", new Date().toISOString());
  return count ?? 0;
}

function relDays(n: number) {
  return n === 0 ? "היום" : n === 1 ? "מחר" : `בעוד ${n} ימים`;
}

function Fact({ label, value, sub, alert }: { label: string; value: string; sub?: string; alert?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="mt-1 text-lg font-semibold leading-tight">{alert ? <span className="hl">{value}</span> : value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-ink-soft">{sub}</dd>}
    </div>
  );
}

/** The semester as a row of weeks: reading done, this week, and tutorial nights. */
function SemesterStrip({ weeks, meetups, today, color }: { weeks: ReadingItem[]; meetups: UserEvent[]; today: string; color: string }) {
  if (!weeks.length) return null;
  const cur = weekFor(weeks, today);
  return (
    <ol className="mt-5 flex gap-1" aria-label="שבועות הסמסטר">
      {weeks.map((w, i) => {
        const from = w.starts ?? "";
        const to = weeks[i + 1]?.starts ? addDays(weeks[i + 1].starts!, -1) : addDays(from, 6);
        const done = w.links.length > 0 && w.links.every((l) => l.done);
        const some = w.links.some((l) => l.done);
        const isCur = cur?.ref === w.ref;
        const meet = meetups.filter((m) => m.date >= from && m.date <= to && !m.cancelled).length;
        return (
          <li key={w.ref} className="min-w-0 flex-1" title={`שבוע ${w.ref}: ${w.label}${meet ? ` · ${meet === 1 ? "מפגש" : `${meet} מפגשים`}` : ""}`}>
            <span
              className={`block h-2.5 rounded-sm ${isCur ? "ring-2 ring-ink ring-offset-2 ring-offset-bg" : ""}`}
              style={{ background: done ? color : some ? `color-mix(in srgb, ${color} 45%, var(--rule))` : "var(--rule)" }}
            />
            <span className={`mt-1 flex items-center justify-center gap-0.5 text-[10px] tabular-nums ${isCur ? "font-semibold text-ink" : "text-ink-soft"}`}>
              {w.ref}
              {meet > 0 && <span className="size-1 rounded-full bg-ink-soft" aria-hidden />}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function SessionRows({ sessions, status, highlight }: { sessions: Session[]; status: Record<string, "done" | "skipped">; highlight?: string }) {
  if (!sessions.length) return <p className="px-5 pb-5 pt-2 text-sm text-ink-soft">אין לימוד מתוכנן לקורס בשבועיים הקרובים.</p>;
  return (
    <ol className="mt-3 divide-y divide-rule border-t border-rule">
      {sessions.map((s) => {
        const st = status[sessionKey(s)];
        return (
          <li key={sessionKey(s)} className="flex items-center gap-4 px-5 py-3 text-sm">
            <span className="w-24 shrink-0 text-ink-soft">{day(s.date)}</span>
            <bdi dir="ltr" className="w-24 shrink-0 tabular-nums text-ink-soft">
              {s.start}–{s.end}
            </bdi>
            <span className={`min-w-0 flex-1 ${st ? "text-ink-soft line-through" : ""}`}>
              {highlight && s.title.startsWith(highlight) ? <b>{s.title}</b> : s.title}
              {s.why && <span className="block text-xs text-ink-soft no-underline">יותר זמן כאן: {s.why}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function HoursPanel({ hours }: { hours: ReturnType<typeof courseHours> }) {
  const max = Math.max(60, ...hours.history.map((h) => h.minutes));
  return (
    <section className="panel p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="section-title">שעות לימוד</h2>
        <Link href="/log" className="text-sm text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
          ליומן השעות
        </Link>
      </div>
      <div className="mt-4 flex h-20 items-end gap-1.5" role="img" aria-label="שעות לימוד בשמונת השבועות האחרונים">
        {hours.history.map((h, i) => (
          <span key={h.week} className="flex flex-1 flex-col items-center gap-1">
            <span
              className="w-full rounded-t-sm"
              style={{ height: `${Math.max(2, (h.minutes / max) * 64)}px`, background: i === hours.history.length - 1 ? "var(--course)" : "color-mix(in srgb, var(--course) 40%, var(--rule))" }}
              title={`${formatHebrewDate(h.week, { day: "numeric", month: "numeric" })}: ${hrs(h.minutes)}`}
            />
            <span className="text-[10px] tabular-nums text-ink-soft">{formatHebrewDate(h.week, { day: "numeric", month: "numeric" })}</span>
          </span>
        ))}
      </div>
      {hours.assignments.length > 0 && (
        <table className="mt-5 w-full text-sm">
          <caption className="mb-2 text-start text-xs text-ink-soft">הכנה למטלות הפתוחות</caption>
          <thead className="text-xs text-ink-soft">
            <tr className="[&>th]:pb-1.5 [&>th]:text-start [&>th]:font-normal">
              <th>מטלה</th>
              <th>נדרש</th>
              <th>נעשה</th>
              <th>מתוכנן</th>
              <th>חסר</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule tabular-nums">
            {hours.assignments.map((a) => (
              <tr key={a.n} className="[&>td]:py-1.5">
                <td>
                  {a.label} <span className="text-xs text-ink-soft">· {day(a.due)}</span>
                </td>
                <td>{hrs(a.need)}</td>
                <td>{hrs(a.done)}</td>
                <td>{hrs(a.scheduled)}</td>
                <td className={a.missing ? "font-semibold" : "text-ink-soft"}>{a.missing ? hrs(a.missing) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** The course chapter by chapter: when it's read, the book link, and videos for it. */
function ChapterTrack({ topics, weeks, today, watched, total, color }: { topics: VideoTopic[]; weeks: ReadingItem[]; today: string; watched: number; total: number; color: string }) {
  if (!topics.length) return <p className="text-ink-soft">עוד אין סרטונים לקורס הזה.</p>;
  const cur = weekFor(weeks, today);
  const weekOf = (t: VideoTopic) => (t.chapter ? weeks.find((w) => w.links.some((l) => l.href && t.chapter && l.href.split("&p=")[0] === t.chapter.href.split("&p=")[0] && (!t.chapter.href.includes("&p=") || l.href === t.chapter.href))) : undefined);
  return (
    <div>
      <p className="text-sm text-ink-soft">
        סרטונים שנבחרו לכל פרק: שיעורים מוקלטים של האוניברסיטה הפתוחה, הרצאות בעברית, וכמה סרטונים באנגלית (מסומנים EN). נצפו {watched} מתוך {total}.
      </p>
      <ol className="mt-6 space-y-8 border-s-2 border-rule ps-5 sm:ps-7">
        {topics.map((t) => {
          const w = weekOf(t);
          const now = !!w && w.ref === cur?.ref;
          return (
            <li key={t.sort} className="relative">
              <span
                className="absolute top-1.5 -start-[calc(1.25rem+7px)] size-3 rounded-full border-2 border-bg sm:-start-[calc(1.75rem+7px)]"
                style={{ background: t.chapter?.done ? color : now ? "var(--ink)" : "var(--rule)" }}
                aria-hidden
              />
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-lg font-semibold">
                  <MathText text={t.topic} />
                </h3>
                {w && <span className={`text-xs ${now ? "rounded-full bg-accent px-2 py-0.5 text-on-accent" : "text-ink-soft"}`}>{now ? "השבוע" : `שבוע ${w.ref}`}</span>}
                {t.chapter?.done && <span className="text-xs text-ink-soft">נקרא</span>}
                {t.chapter && (
                  <Link href={t.chapter.href} className="ms-auto inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
                    <Icon name="book" className="size-4" />
                    לפרק בספר
                  </Link>
                )}
              </div>
              <div className="mt-3">
                <VideoStrip videos={t.videos} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

async function Meetups({ meetups, weeks, today, code }: { meetups: UserEvent[]; weeks: ReadingItem[]; today: string; code: string }) {
  const notes = new Map<string, { body: string; attended: boolean | null; files?: number }>();
  if (supabaseEnabled) {
    const sb = await createClient();
    const [{ data }, { data: files }] = await Promise.all([
      sb.from("meetup_notes").select("date, body, attended").eq("course_code", code),
      sb.from("meetup_files").select("date").eq("course_code", code),
    ]);
    for (const n of data ?? []) notes.set(n.date, { body: n.body, attended: n.attended });
    for (const f of files ?? []) {
      const n = notes.get(f.date) ?? { body: "", attended: null };
      notes.set(f.date, { ...n, files: (n.files ?? 0) + 1 });
    }
  }
  const next = meetups.filter((m) => m.date >= today);
  const past = meetups.filter((m) => m.date < today);
  const row = (m: UserEvent) => {
    const w = m.kind === "tutorial" ? weekFor(weeks, m.date) : null;
    return (
      <li key={m.id} className={`flex flex-wrap gap-x-4 gap-y-2 px-5 py-4 ${m.cancelled ? "opacity-60" : ""}`}>
        <span className="w-28 shrink-0">
          <span className="block font-medium">{day(m.date)}</span>
          <bdi dir="ltr" className="block text-sm tabular-nums text-ink-soft">
            {m.start_time}–{m.end_time ?? ""}
          </bdi>
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block ${m.cancelled ? "line-through" : ""}`}>
            {m.title}
            {m.kind === "other" && <span className="ms-2 text-xs text-ink-soft">לא חובה</span>}
            {m.cancelled && <span className="ms-2 text-xs">בוטל</span>}
          </span>
          {m.location && <span className="block text-sm text-ink-soft">{m.location}</span>}
          {m.kind === "tutorial" && !m.cancelled && <MeetupLine href={meetupHref(code, m.date)} note={notes.get(m.date)} past={m.date < today} />}
          {w && w.links.length > 0 && (
            <span className="mt-2 block">
              <span className="text-xs text-ink-soft">לקראת המפגש · {w.label}</span>
              <ReadChips links={w.links} className="mt-1" />
            </span>
          )}
        </span>
      </li>
    );
  };
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="panel overflow-hidden">
        <h2 className="section-title px-5 pt-5">המפגשים הקרובים</h2>
        {next.length ? <ol className="mt-3 divide-y divide-rule border-t border-rule">{next.map(row)}</ol> : <p className="px-5 pb-5 pt-2 text-sm text-ink-soft">אין מפגשים קרובים.</p>}
      </section>
      {past.length > 0 && (
        <section className="panel self-start overflow-hidden">
          <h2 className="section-title px-5 pt-5">מפגשים שהיו</h2>
          <ol className="mt-3 divide-y divide-rule border-t border-rule text-sm">{past.reverse().map(row)}</ol>
        </section>
      )}
    </div>
  );
}

/** Countdown to the exam I'm taking and the revision planned for it (or, before dates exist, the semester end). */
function ExamCard({ exam, run, today, code, hasRows }: { exam: Exam | null; run: Runway | null; today: string; code: string; hasRows: boolean }) {
  if (!exam) {
    const end = semesterEnd();
    return (
      <section className="panel p-5">
        <h2 className="section-title">הבחינה</h2>
        <p className="mt-2 text-sm leading-relaxed">
          {hasRows ? "מועד הבחינה שבחרת כבר עבר." : "מועדי הבחינות עוד לא פורסמו."} הסמסטר נגמר ב־<b>{formatHebrewDate(end, { day: "numeric", month: "numeric" })}</b> ({relDays(daysBetween(today, end))}), והבחינות אחריו.
        </p>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer underline decoration-rule underline-offset-4">להזנת המועדים כשיתפרסמו</summary>
          <div className="mt-3">
            <ExamDates code={code} exams={[]} editable={supabaseEnabled} />
          </div>
        </details>
      </section>
    );
  }
  const left = daysBetween(today, exam.date);
  return (
    <section className="panel p-5">
      <h2 className="section-title">הבחינה · מועד {exam.moed}</h2>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-4xl tabular-nums">{left}</span>
        <span className="text-ink-soft">{left === 1 ? "יום" : "ימים"}</span>
      </p>
      <p className="text-sm">
        {day(exam.date)}
        {exam.start_time ? `, ${range(exam.start_time)}` : ""}
      </p>
      {run && run.minutes > 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          חזרה מתוכננת: {duration(run.minutes)} ב־{run.sessions.length} מפגשים, החל מ־{day(run.first!)}
          {run.mocks ? `, כולל ${run.mocks === 1 ? "בחינה לדוגמה אחת" : `${run.mocks} בחינות לדוגמה`}` : ""}.
        </p>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">החזרות מתחילות שלושה שבועות לפני הבחינה, ויופיעו כאן ובלוח השנה.</p>
      )}
    </section>
  );
}

function RunwayPanel({ exam, run, today, status }: { exam: Exam | null; run: Runway | null; today: string; status: Record<string, "done" | "skipped"> }) {
  return (
    <section className="panel overflow-hidden">
      <h2 className="section-title px-5 pt-5">החזרות לקראת הבחינה</h2>
      {!exam ? (
        <p className="px-5 pb-5 pt-2 text-sm text-ink-soft">
          אחרי שמזינים מועד, התוכנית שומרת זמן לחזרה בשלושת השבועות שלפניו, עם בחינה לדוגמה פעם בשבוע. עד אז היא מתכננת עד סוף הסמסטר ({formatHebrewDate(semesterEnd(), { day: "numeric", month: "numeric" })}).
        </p>
      ) : !run?.sessions.length ? (
        <p className="px-5 pb-5 pt-2 text-sm text-ink-soft">
          החזרות יתחילו ב־{day(addDays(exam.date, -21) > today ? addDays(exam.date, -21) : today)}.
        </p>
      ) : (
        <>
          <SessionRows sessions={run.sessions.slice(0, 40)} status={status} highlight={MOCK_TITLE} />
          {run.sessions.some((s) => s.title.startsWith(MOCK_TITLE) && s.minutes < 180) && (
            <p className="border-t border-rule px-5 py-3 text-xs text-ink-soft">
              בחינה לדוגמה אורכת 3 שעות, אבל חלון הלימוד בימים האלה קצר יותר. אפשר להאריך אותו בהגדרות, או לפתור רק חלק מהשאלות.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function MeetupLine({ href, note, past }: { href: string; note?: { body: string; attended: boolean | null; files?: number }; past: boolean }) {
  const stars = note ? examLines(note.body).length : 0;
  const qs = note ? questionLines(note.body).length : 0;
  const bits = [
    note?.attended === false ? "פספסתי" : note?.attended ? "הייתי" : "",
    note?.body.trim() ? "יש הערות" : "",
    stars ? `${stars} ⭐` : "",
    qs ? `${qs} ❓` : "",
    note?.files ? (note.files === 1 ? "קובץ אחד" : `${note.files} קבצים`) : past ? "בלי קבצים" : "",
  ].filter(Boolean);
  return (
    <Link href={href} className="mt-1 inline-flex items-center gap-1.5 text-sm text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
      <Icon name="pencil" className="size-3.5" />
      {past ? (bits.length ? bits.join(" · ") : "לסיכום המפגש") : bits.length ? `מצב מפגש · ${bits.join(" · ")}` : "מצב מפגש: שאלות והערות"}
    </Link>
  );
}
