import { Suspense } from "react";
import { connection } from "next/server";
import { StudySession } from "@/components/StudySession";
import { getCourses } from "@/lib/userdata";
import { getPracticeData } from "@/lib/practiceData";

export default function StudyPage({ searchParams }: PageProps<"/study">) {
  return (
    <>
      <h1 className="font-display text-4xl">תרגול</h1>
      <p className="mt-2 text-ink-soft">כרטיסיות ושאלות מהפרקים שפתחת, מיקס בין פרקים, ותרגול אינסופי עם בדיקה מדויקת.</p>
      {/* PRACTICE-MARKS SLOT: the lead places <PracticeMarks /> (src/components/PracticeMarks.tsx, from rv-automation) here at merge. */}
      <Suspense fallback={<div className="mt-8 h-72 max-w-2xl animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Study searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Study({ searchParams }: Pick<PageProps<"/study">, "searchParams">) {
  await connection();
  const [sp, data, mine] = await Promise.all([searchParams, getPracticeData(), getCourses()]);
  const courses = mine.map((c) => ({ code: c.code, name: c.short, color: c.color }));
  const course = typeof sp.course === "string" ? sp.course : "all";
  return (
    <StudySession
      cards={data.cards}
      questions={data.questions}
      chapters={data.chapters}
      answeredToday={data.answeredToday}
      courses={courses}
      initialCourse={course}
      initialMode={sp.mode === "mix" ? "mix" : "today"}
    />
  );
}
