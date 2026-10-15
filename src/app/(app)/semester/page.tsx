import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { SemesterCalendar, type CalItem } from "@/components/SemesterCalendar";
import { progressKey } from "@/lib/progress";
import { getUserPlan } from "@/lib/userdata";
import { courseTheme, semester, todayInIsrael, typeLabel } from "@/lib/semester";

export default function SemesterPage() {
  return (
    <>
      <h1 className="font-display text-4xl">לוח שנה</h1>
      <p className="mt-2 text-ink-soft">
        הגשות, בחינות ומפגשי הלימוד המתוכננים בסמסטר {semester.semester}. לחצו על יום כדי לראות את הפירוט.
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
  const { progress, exams, plan } = await getUserPlan(today);

  const items: CalItem[] = [];
  for (const c of semester.courses) {
    const theme = courseTheme[c.code];
    for (const a of c.assignments) {
      const status = progress[progressKey(c.code, a.n)]?.status;
      items.push({
        date: a.due,
        kind: "due",
        color: theme.color,
        label: `${typeLabel[a.type]} ${a.n} ב${theme.short}`,
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
      time: e.start_time ?? undefined,
    });
  }
  for (const s of plan.sessions) {
    items.push({
      date: s.date,
      kind: "study",
      color: courseTheme[s.courseCode].color,
      label: s.title,
      time: `${s.start}–${s.end}`,
      minutes: s.minutes,
    });
  }

  const lastDate = items.map((i) => i.date).sort().at(-1) ?? today;
  const months: string[] = [];
  for (let m = today.slice(0, 7); m <= lastDate.slice(0, 7); ) {
    months.push(m);
    const [y, mo] = m.split("-").map(Number);
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  }

  return (
    <div className="mt-8">
      <SemesterCalendar
        items={items}
        months={months}
        today={today}
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
