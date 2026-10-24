import { Suspense } from "react";
import { connection } from "next/server";
import { StudySession } from "@/components/StudySession";
import { getCardStats, getCourses } from "@/lib/userdata";

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
  const [{ due, total, byCourse }, mine] = await Promise.all([getCardStats(), getCourses()]);
  const courses = mine.map((c) => ({ code: c.code, name: c.short, color: c.color }));
  return (
    <>
      {total > 0 && (
        <p className="mt-4 text-sm text-ink-soft">
          {`${due.length} לחזרה עכשיו, מתוך ${total} כרטיסים. ` +
            courses
              .filter((c) => byCourse[c.code])
              .map((c) => `${c.name}: ${byCourse[c.code].due}/${byCourse[c.code].total}`)
              .join(" · ")}
        </p>
      )}
      <StudySession cards={due} courses={courses} total={total} />
    </>
  );
}
