import { Suspense } from "react";
import Link from "next/link";
import { Gallery } from "@/components/Fold";
import { connection } from "next/server";
import { AssignmentChecklist } from "@/components/AssignmentChecklist";
import { ruleHe, StandingText, WeightBar } from "@/components/CourseParts";
import { coursesFor, getProgress, progressKey, standing } from "@/lib/progress";
import { GradeCalculator } from "@/components/GradeCalculator";
import { AddCourse, CourseLook } from "@/components/CourseManager";
import { supabaseEnabled } from "@/lib/supabase/config";
import { getCourses, getFriendView, getNotes, getPeople, getReviews, getSpentByAssignment, getStuck } from "@/lib/userdata";
import { StuckList } from "@/components/StuckList";
import { getBooks } from "@/lib/books";
import { getReadings } from "@/lib/readings";
import { getForumPosts } from "@/lib/forum";
import { Avatar } from "@/components/Avatar";
import {
  formatHebrewDate,
  semester,
  todayInIsrael,
  typeLabel,
  PALETTE,
} from "@/lib/semester";

export default function CoursesPage() {
  return (
    <>
      <h1 className="font-display text-4xl">הקורסים</h1>
      <p className="mt-2 text-ink-soft">
        סמנו מטלה כשהיא מוגשת, והוסיפו את הציון כשהוא מגיע.
      </p>
      <Suspense
        fallback={
          <div
            className="mt-8 h-96 animate-pulse rounded-xl bg-rule/60"
            aria-hidden
          />
        }
      >
        <Courses />
      </Suspense>
    </>
  );
}

const linkClass = "underline underline-offset-4 decoration-rule hover:text-ink";

async function Courses() {
  await connection();
  const today = todayInIsrael();
  const [progress, notes, base, reviews, spent, stuck, people, books, forum] = await Promise.all([
    getProgress(),
    getNotes(),
    getCourses(),
    getReviews(),
    getSpentByAssignment(),
    getStuck(),
    getPeople(),
    getBooks(),
    getForumPosts(),
  ]);
  const plans = await getReadings(books);
  // Course rooms: friends I follow who take the same course (and what they've submitted, if they share it).
  const following = people.filter((p) => p.i_follow === "accepted");
  const views = await Promise.all(following.map((p) => getFriendView(p.id)));
  const roomFor = (code: string) =>
    following.flatMap((p, i) => {
      const v = views[i];
      if (!v || !(v.courses ?? []).some((c) => c.code === code)) return [];
      const done = v.share.progress
        ? v.progress.filter((x) => x.course_code === code && x.semester === semester.semester && x.status === "submitted").map((x) => x.n)
        : null;
      return [{ id: p.id, name: p.name, avatar_url: p.avatar_url, avatar_emoji: p.avatar_emoji, avatar_color: p.avatar_color, done }];
    });

  const colorKey = (css: string) =>
    Object.entries(PALETTE).find(([, v]) => v.css === css)?.[0] ?? "slate";
  return (
    <>
      {base.length === 0 && (
        <div className="panel mt-8 max-w-xl p-6">
          <h2 className="section-title">
            אילו קורסים את/ה לומד/ת בסמסטר {semester.semester}?
          </h2>
          <p className="mt-1 text-ink-soft">
            הוסיפו כל קורס לפי המספר שלו (5 ספרות). המטלות, המשקלים ותאריכי
            ההגשה נטענים מדף דרישות הקורס הרשמי.
          </p>
        </div>
      )}
      <div className="mt-6">
        <AddCourse semester={semester.semester} />
      </div>
      <Gallery className="mt-8 items-start lg:gap-6" until="lg" cols="lg:grid-cols-2 xl:grid-cols-3" item="[&>*]:w-[88%] sm:[&>*]:w-[70%]">
        {coursesFor(progress, base).map((c) => {
          const theme = c;
          const st = standing(c, progress, today);
          return (
            <article
              key={c.code}
              id={`c${c.code}`}
              className="panel scroll-mt-24 overflow-hidden"
              style={{ borderTop: `4px solid ${theme.color}` }}
            >
              <div className="px-5 pt-5">
                <h2 className="text-xl font-semibold leading-snug">
                  <Link href={`/courses/${c.code}`} className="hover:underline">
                    {c.name}
                  </Link>
                </h2>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {c.code}, מרכז ההוראה {c.coordinator}
                </p>
                <WeightBar course={c} st={st} color={theme.color} />
                <StandingText
                  st={st}
                  min={c.assignmentWeight.min}
                  max={c.assignmentWeight.max}
                />
              </div>

              <div className="px-5">
                <AssignmentChecklist
                  code={c.code}
                  color={theme.color}
                  editable={supabaseEnabled}
                  items={c.assignments.map((a) => ({
                    n: a.n,
                    reading: plans.assignments[c.code]?.[a.n] ?? null,
                    forum: forum.filter((f) => f.courseCode === c.code && f.assignment === a.n).slice(0, 3).map((f) => ({ topic: f.topic, href: `/mail?open=${f.mailId}` })),
                    label: `${typeLabel[a.type]} ${a.n}`,
                    due:
                      formatHebrewDate(a.due, {
                        day: "numeric",
                        month: "numeric",
                      }) + (a.originalDue ? " (הוארך)" : ""),
                    weight: a.weight,
                    past: a.due < today,
                    progress: progress[progressKey(c.code, a.n)] ?? {
                      status: "todo",
                      grade: null,
                    },
                    spent: spent[`${c.code}|${a.n}`],
                    review: reviews.find((r) => r.course_code === c.code && r.n === a.n) ?? null,
                  }))}
                />
              </div>

              <GradeCalculator
                color={theme.color}
                max={c.assignmentWeight.max}
                rows={c.assignments.map((a) => {
                  const p = progress[progressKey(c.code, a.n)];
                  return {
                    n: a.n,
                    reading: plans.assignments[c.code]?.[a.n] ?? null,
                    forum: forum.filter((f) => f.courseCode === c.code && f.assignment === a.n).slice(0, 3).map((f) => ({ topic: f.topic, href: `/mail?open=${f.mailId}` })),
                    label: `${typeLabel[a.type]} ${a.n}`,
                    weight: a.weight,
                    grade: p?.status === "submitted" ? (p.grade ?? null) : null,
                    status: p?.status ?? "todo",
                  };
                })}
              />

              <CourseRoom people={roomFor(c.code)} />

              <StuckList items={stuck.filter((x) => x.course_code === c.code)} />

              <CourseNotes
                notes={notes.filter((n) => n.course_code === c.code)}
              />

              <div className="border-t border-rule bg-bg/50 px-5 py-4 text-sm text-ink-soft">
                {c.rules && (
                  <details className="mb-3">
                    <summary className="cursor-pointer text-ink">
                      כללים מיוחדים בקורס
                    </summary>
                    <ul className="mt-2 list-disc space-y-1 ps-5">
                      {c.rules.map((r) => (
                        <li key={r}>{ruleHe[r] ?? r}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {c.finalAssessment && (
                  <p className="mb-2">הערכה מסכמת: {c.finalAssessment}</p>
                )}
                {forum.some((f) => f.courseCode === c.code) && (
                  <details className="mb-3">
                    <summary className="cursor-pointer font-medium text-ink">
                      מהפורומים ({forum.filter((f) => f.courseCode === c.code).length})
                      {forum.some((f) => f.courseCode === c.code && !f.isRead) && <span className="ms-2 inline-block size-2 rounded-full bg-ink align-middle" aria-label="יש חדשים" />}
                    </summary>
                    <ul className="mt-2 space-y-2">
                      {forum
                        .filter((f) => f.courseCode === c.code)
                        .slice(0, 6)
                        .map((f) => (
                          <li key={f.mailId}>
                            <Link href={`/mail?open=${f.mailId}`} className="block hover:text-ink">
                              <span className={`block ${f.isRead ? "" : "font-medium text-ink"}`}>{f.topic}</span>
                              <span className="block text-xs">
                                {f.forum} · {f.author ?? ""} · {formatHebrewDate(f.at.slice(0, 10), { day: "numeric", month: "numeric" })}
                              </span>
                            </Link>
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
                <div className="flex flex-wrap gap-4">
                  <Link className={`${linkClass} font-medium text-ink`} href={`/courses/${c.code}`}>
                    עמוד הקורס
                  </Link>
                  <Link className={linkClass} href={`/books?course=${c.code}`}>
                    ספרי הקורס
                  </Link>
                  <a
                    className={linkClass}
                    href={
                      c.opalId
                        ? `https://opal.openu.ac.il/course/view.php?id=${c.opalId}`
                        : "https://opal.openu.ac.il/my/"
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    אתר הקורס
                  </a>
                  <a
                    className={linkClass}
                    href={`https://academic.openu.ac.il/course-requirements/course/${c.code}/semester/${encodeURIComponent(semester.semester)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    דרישות הקורס
                  </a>
                </div>
                <CourseLook
                  code={c.code}
                  short={c.short}
                  color={colorKey(c.color)}
                />
              </div>
            </article>
          );
        })}
      </Gallery>
    </>
  );
}

function CourseNotes({
  notes,
}: {
  notes: Awaited<ReturnType<typeof getNotes>>;
}) {
  return (
    <div className="border-t border-rule px-5 py-4">
      <h3 className="text-sm font-semibold">סיכומים מ־Notability</h3>
      {notes.length === 0 ? (
        <p className="mt-1 text-sm text-ink-soft">
          עוד אין. סיכומים יגיעו לכאן אחרי הגיבוי הבא ל־Google Drive.
        </p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {notes.slice(0, 8).map((n) => (
            <li key={n.id}>
              <a
                href={n.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline underline-offset-4 decoration-rule hover:decoration-current"
              >
                {n.name.replace(/\.pdf$/i, "")}
              </a>
              {n.modified_at && (
                <span className="text-xs text-ink-soft">
                  {" "}
                  {new Intl.DateTimeFormat("he-IL", {
                    day: "numeric",
                    month: "numeric",
                    timeZone: "Asia/Jerusalem",
                  }).format(new Date(n.modified_at))}
                </span>
              )}
              {n.summary && <p className="mt-0.5 text-ink-soft">{n.summary}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CourseRoom({
  people,
}: {
  people: { id: string; name: string; avatar_url: string | null; avatar_emoji?: string | null; avatar_color?: string | null; done: string[] | null }[];
}) {
  if (!people.length) return null;
  return (
    <div className="border-t border-rule px-5 py-4">
      <h3 className="text-sm font-semibold">חברים בקורס</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <Avatar name={p.name} url={p.avatar_url} emoji={p.avatar_emoji} color={p.avatar_color} size={26} />
            <a href={`/friends/${p.id}`} className="font-medium hover:underline">
              {p.name.split(" ")[0]}
            </a>
            <span className="text-ink-soft">
              {p.done == null ? "לא משתף/ת התקדמות" : p.done.length ? `הגיש/ה ${p.done.sort().join(", ")}` : "עוד לא הגיש/ה"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
