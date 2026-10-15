import { Suspense } from "react";
import { connection } from "next/server";
import { StudySession } from "@/components/StudySession";
import { getCardStats } from "@/lib/userdata";
import { courseTheme, semester } from "@/lib/semester";

export default function StudyPage() {
  return (
    <>
      <h1 className="font-display text-4xl">תרגול</h1>
      <p className="mt-2 text-ink-soft">שאלות קצרות וכרטיסיות, עם חזרה מרווחת: מה שקשה חוזר מהר, מה שידוע חוזר רחוק.</p>
      <Suspense fallback={<div className="mt-8 h-72 max-w-2xl animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Study />
      </Suspense>
    </>
  );
}

async function Study() {
  await connection();
  const { due, total, byCourse } = await getCardStats();
  const courses = semester.courses.map((c) => ({ code: c.code, name: courseTheme[c.code].short, color: courseTheme[c.code].color }));
  return (
    <>
      <p className="mt-4 text-sm text-ink-soft">
        {total === 0
          ? "עוד אין כרטיסים. הראשונים ייווצרו בסבב הבוקר הקרוב."
          : `${due.length} לחזרה עכשיו, מתוך ${total} כרטיסים. ` +
            courses
              .filter((c) => byCourse[c.code])
              .map((c) => `${c.name}: ${byCourse[c.code].due}/${byCourse[c.code].total}`)
              .join(" · ")}
      </p>
      <StudySession cards={due} courses={courses} />
    </>
  );
}
