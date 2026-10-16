import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { SemesterCalendar, type CalItem } from "@/components/SemesterCalendar";
import { progressKey } from "@/lib/progress";
import { getUserPlan } from "@/lib/userdata";
import { sessionKey } from "@/lib/planner";
import { academicByDay } from "@/lib/academic";
import { supabaseEnabled } from "@/lib/supabase/config";
import { courseTheme, semester, todayInIsrael, typeLabel } from "@/lib/semester";

export default function SemesterPage() {
  return (
    <>
      <h1 className="font-display text-4xl">לוח שנה</h1>
      <p className="mt-2 text-ink-soft">
        הגשות, בחינות, הלוח האקדמי ומפגשי הלימוד שלך. לחצו על יום כדי לסמן מפגש כבוצע או להוסיף אירוע.
      </p>
      <Suspense fallback={<div className="mt-8 h-[36rem] animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Semester />
      </Suspense>
    </>
  );
}

async function Semester() {
  await connection();
  const today = todayInIsrael();
  const { progress, exams, plan, events, status, courses } = await getUserPlan(today);

  const items: CalItem[] = [];
  for (const c of courses) {
    const theme = courseTheme[c.code];
    for (const a of c.assignments) {
      const status = progress[progressKey(c.code, a.n)]?.status;
      items.push({
        date: a.due,
        kind: "due",
        color: theme.color,
        label: `${typeLabel[a.type]} ${a.n} ב${theme.short}${a.originalDue ? " (הוארך)" : ""}`,
        done: status === "submitted" || status === "skipped",
      });
    }
  }
  for (const e of exams) {
    const theme = courseTheme[e.course_code];
    items.push({
      date: e.date,
      kind: "exam",
      color: theme.color,
      label: `בחינה ב${theme.short}, מועד ${e.moed}`,
      start: e.start_time ?? undefined,
      end: e.start_time ? `${String(Math.min(23, Number(e.start_time.slice(0, 2)) + 3)).padStart(2, "0")}${e.start_time.slice(2)}` : undefined,
    });
  }
  for (const s of plan.sessions) {
    const key = sessionKey(s);
    items.push({
      date: s.date,
      kind: "study",
      color: courseTheme[s.courseCode].color,
      label: s.title,
      start: s.start,
      end: s.end,
      minutes: s.minutes,
      sessionKey: key,
      status: status[key],
    });
  }
  for (const ev of events) {
    items.push({
      date: ev.date,
      kind: ev.kind === "tutorial" ? "tutorial" : "event",
      color: ev.course_code ? courseTheme[ev.course_code]?.color ?? "var(--ink-soft)" : "var(--ink-soft)",
      label: (ev.cancelled ? "בוטל: " : "") + (ev.location ? `${ev.title} (${ev.location})` : ev.title),
      done: ev.cancelled,
      start: ev.start_time ?? undefined,
      end: ev.end_time ?? undefined,
      eventId: ev.id,
      deletable: ev.source === "manual",
    });
  }
  for (const a of academicByDay()) {
    items.push({ date: a.date, kind: "academic", color: "var(--ink-soft)", label: a.title, holiday: a.holiday });
  }

  return (
    <div className="mt-8">
      <SemesterCalendar
        items={items}
        today={today}
        editable={supabaseEnabled}
        legend={semester.courses.map((c) => ({ color: courseTheme[c.code].color, label: c.name }))}
      />
      {exams.length === 0 && (
        <p className="mt-4 text-sm text-ink-soft">
          מועדי הבחינות עוד לא הוזנו.{" "}
          <Link href="/settings" className="underline underline-offset-4 decoration-rule hover:text-ink">
            להוספה בהגדרות
          </Link>
        </p>
      )}
    </div>
  );
}
