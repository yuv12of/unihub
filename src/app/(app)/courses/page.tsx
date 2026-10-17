import { Suspense } from "react";
import { Gallery } from "@/components/Fold";
import { connection } from "next/server";
import { AssignmentChecklist } from "@/components/AssignmentChecklist";
import { ruleHe, StandingText, WeightBar } from "@/components/CourseParts";
import { coursesFor, getProgress, progressKey, standing } from "@/lib/progress";
import { GradeCalculator } from "@/components/GradeCalculator";
import { AddCourse, CourseLook } from "@/components/CourseManager";
import { supabaseEnabled } from "@/lib/supabase/config";
import { getCourses, getNotes } from "@/lib/userdata";
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
  const [progress, notes, base] = await Promise.all([
    getProgress(),
    getNotes(),
    getCourses(),
  ]);

  const colorKey = (css: string) =>
    Object.entries(PALETTE).find(([, v]) => v.css === css)?.[0] ?? "slate";
  return (
    <>
      {base.length === 0 && (
        <div className="panel mt-8 max-w-xl p-6">
          <h2 className="text-lg font-semibold">
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
      <Gallery className="mt-8 items-start sm:gap-6" cols="sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3" item="[&>*]:w-[88%]">
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
                <h2 className="text-xl font-semibold leading-snug">{c.name}</h2>
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
                    label: `${typeLabel[a.type]} ${a.n}`,
                    weight: a.weight,
                    grade: p?.status === "submitted" ? (p.grade ?? null) : null,
                    status: p?.status ?? "todo",
                  };
                })}
              />

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
                <div className="flex flex-wrap gap-4">
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
