import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { standingSentence } from "@/components/CourseParts";
import { progressKey, standing } from "@/lib/progress";
import { AddCourse, CourseLook } from "@/components/CourseManager";
import { getFriendView, getPeople, getSessionRows, getUserPlan } from "@/lib/userdata";
import { courseHours } from "@/lib/courseHours";
import { Avatar } from "@/components/Avatar";
import { Chevron, Icon } from "@/components/Icon";
import { duration } from "@/lib/time";
import { daysBetween, formatHebrewDate, PALETTE, relativeDays, semester, todayInIsrael, typeLabel } from "@/lib/semester";

export default function CoursesPage() {
  return (
    <>
      <h1 className="font-display text-4xl">הקורסים</h1>
      <p className="mt-2 text-ink-soft">כל קורס במבט אחד. המטלות, הציונים, הפרקים והמפגשים בעמוד של כל קורס.</p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Courses />
      </Suspense>
    </>
  );
}

/** /courses: a slim index. Everything per course lives on /courses/[code]. */
async function Courses() {
  await connection();
  const today = todayInIsrael();
  const [{ progress, plan, courses }, rows, people] = await Promise.all([getUserPlan(today), getSessionRows(), getPeople()]);

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
  const colorKey = (css: string) => Object.entries(PALETTE).find(([, v]) => v.css === css)?.[0] ?? "slate";

  return (
    <>
      {courses.length === 0 && (
        <div className="panel mt-8 max-w-xl p-6">
          <h2 className="section-title">אילו קורסים את/ה לומד/ת בסמסטר {semester.semester}?</h2>
          <p className="mt-1 text-ink-soft">הוסיפו כל קורס לפי המספר שלו (5 ספרות). המטלות, המשקלים ותאריכי ההגשה נטענים מדף דרישות הקורס הרשמי.</p>
        </div>
      )}

      <ul className="mt-8 grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {courses.map((c) => {
          const st = standing(c, progress, today);
          const s = standingSentence(st, c.assignmentWeight.min, c.assignmentWeight.max);
          const h = courseHours({ course: c, plan, rows, progress, today });
          const nextDue = c.assignments
            .filter((a) => a.due >= today && !["submitted", "skipped"].includes(progress[progressKey(c.code, a.n)]?.status ?? ""))
            .sort((a, b) => a.due.localeCompare(b.due))[0];
          const room = roomFor(c.code);
          const pct = (v: number) => `${Math.min(100, (v / Math.max(1, c.assignmentWeight.max)) * 100)}%`;
          return (
            <li key={c.code} id={`c${c.code}`} className="panel scroll-mt-24 overflow-hidden" style={{ borderTop: `4px solid ${c.color}` }}>
              <Link href={`/courses/${c.code}`} className="group block px-5 pb-4 pt-4 hover:bg-bg/50">
                <div className="flex items-start gap-2">
                  <h2 className="min-w-0 flex-1 text-lg font-semibold leading-snug group-hover:underline">{c.name}</h2>
                  <Chevron dir="forward" className="mt-1 size-5" />
                </div>
                <p className="text-xs text-ink-soft">
                  {c.code} · {c.coordinator}
                </p>

                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-ink-soft">ההגשה הבאה</dt>
                    <dd className="font-medium">
                      {nextDue ? (
                        <>
                          {typeLabel[nextDue.type]} {nextDue.n}
                          <span className={`block text-xs font-normal ${daysBetween(today, nextDue.due) <= 7 ? "" : "text-ink-soft"}`}>
                            {formatHebrewDate(nextDue.due, { day: "numeric", month: "numeric" })}, {relativeDays(daysBetween(today, nextDue.due))}
                          </span>
                        </>
                      ) : (
                        "אין"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-soft">השבוע</dt>
                    <dd className="font-medium">
                      {duration(h.weekDone)} נלמדו
                      <span className="block text-xs font-normal text-ink-soft">{h.weekPlanned ? `ועוד ${duration(h.weekPlanned)} בתוכנית` : "אין עוד לימוד מתוכנן"}</span>
                    </dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-xs text-ink-soft">
                    <span>
                      נצברו <b className="text-ink">{st.earned}</b> מתוך {c.assignmentWeight.min} נק׳ חובה
                    </span>
                    <span>אפשר עד {c.assignmentWeight.max}</span>
                  </div>
                  <span className="relative mt-1.5 block h-2 rounded-full bg-rule" aria-hidden>
                    <span className="absolute inset-y-0 start-0 rounded-full" style={{ width: pct(st.earned), background: c.color }} />
                    <span className="absolute -inset-y-1 w-0.5 rounded-full bg-ink" style={{ insetInlineStart: pct(c.assignmentWeight.min) }} />
                  </span>
                  <p className={`mt-1.5 text-xs leading-snug ${s.warn ? "" : "text-ink-soft"}`}>
                    <span className={s.warn ? "hl" : undefined}>{s.text}</span>
                    {!s.warn && <span className="text-ink-soft"> (הקו = המינימום)</span>}
                  </p>
                </div>
              </Link>

              {room.length > 0 && (
                <div className="flex items-center gap-2 border-t border-rule px-5 py-2.5 text-xs text-ink-soft">
                  <span className="flex -space-x-2 space-x-reverse">
                    {room.slice(0, 4).map((p) => (
                      <Avatar key={p.id} name={p.name} url={p.avatar_url} emoji={p.avatar_emoji} color={p.avatar_color} size={24} />
                    ))}
                  </span>
                  <span className="min-w-0 truncate">
                    {room.map((p) => `${p.name.split(" ")[0]}${p.done?.length ? ` (הגיש/ה ${p.done.sort().join(", ")})` : ""}`).join(", ")} גם בקורס
                  </span>
                </div>
              )}

              <div className="border-t border-rule px-5 pb-3 pt-1 text-sm">
                <CourseLook code={c.code} short={c.short} color={colorKey(c.color)} />
              </div>
            </li>
          );
        })}
      </ul>

      <section className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <AddCourse semester={semester.semester} />
        <Link href="/books" className="btn-ghost">
          <Icon name="book" className="size-4" />
          ספרי הקורסים
        </Link>
      </section>
    </>
  );
}
