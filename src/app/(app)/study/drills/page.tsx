import { Suspense } from "react";
import { connection } from "next/server";
import { Drills, type DrillId } from "@/components/practice/Drills";
import { getCourses } from "@/lib/userdata";
import { newSeed } from "@/lib/drills/rng";

export default function DrillsPage({ searchParams }: PageProps<"/study/drills">) {
  return (
    <>
      <h1 className="font-display text-4xl">תרגול אינסופי</h1>
      <p className="mt-2 text-ink-soft">תרגילים טכניים שנוצרים מחדש בכל פעם, עם בדיקה מדויקת של כל צעד. בלי בינה מלאכותית, בלי ניחושים.</p>
      <Suspense fallback={<div className="mt-8 h-72 max-w-2xl animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const IDS: DrillId[] = ["heap", "build", "bst", "chain", "probe", "rref", "det", "deriv", "limit"];

async function Body({ searchParams }: Pick<PageProps<"/study/drills">, "searchParams">) {
  await connection();
  const [sp, mine] = await Promise.all([searchParams, getCourses()]);
  const d = typeof sp.d === "string" && (IDS as string[]).includes(sp.d) ? (sp.d as DrillId) : null;
  return <Drills drill={d} myCourses={mine.map((c) => ({ code: c.code, name: c.short, color: c.color }))} seed={newSeed()} />;
}
