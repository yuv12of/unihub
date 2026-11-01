import { Suspense } from "react";
import { connection } from "next/server";
import { DegreePlanner } from "@/components/DegreePlanner";
import { getCourses } from "@/lib/userdata";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { cleanPlan, cleanScenarios, DEFAULT_SETTINGS, type DegreePlan, type Scenario } from "@/lib/degree";
import type { SheiltaSnapshot } from "@/lib/sheilta";
import type { KnownExam } from "@/lib/examLoad";
import { CURRENT_SEMESTER, todayInIsrael } from "@/lib/semester";

/** The whole degree, semester by semester, checked against the program's rules. */
export default function DegreePage() {
  return (
    <>
      <h1 className="font-display text-4xl">תכנית התואר</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        כל קורס בסמסטר שלו, עם תנאי הקדם, הסמסטרים שבהם הוא נפתח ודרישות התואר במדעי המחשב (תכנית AF). גוררים קורס לסמסטר אחר או פותחים אותו כדי להעביר.
      </p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Degree />
      </Suspense>
    </>
  );
}

async function Degree() {
  await connection();
  const current = CURRENT_SEMESTER.code;
  let plan: DegreePlan | null = null;
  let scenarios: Scenario[] = [];
  let snapshot: SheiltaSnapshot | null = null;
  let exams: KnownExam[] = [];
  if (supabaseEnabled) {
    const sb = await createClient();
    const [{ data }, { data: ex }] = await Promise.all([
      sb.from("degree_plans").select("plan, scenarios, sheilta").maybeSingle(),
      sb.from("exams").select("course_code, date, moed, chosen").eq("semester", current),
    ]);
    if (data?.plan) plan = cleanPlan(data.plan);
    scenarios = cleanScenarios(data?.scenarios ?? []);
    snapshot = (data?.sheilta as SheiltaSnapshot | null) ?? null;
    exams = (ex ?? []) as KnownExam[];
  }
  if (!plan) {
    // a first plan: this semester's courses; the rest is added on the page
    const courses = await getCourses();
    plan = { program: "AF", items: courses.map((c) => ({ code: c.code, sem: current })), recognized: [], settings: DEFAULT_SETTINGS };
  }
  return <DegreePlanner initial={plan} initialScenarios={scenarios} snapshot={snapshot} knownExams={exams} current={current} today={todayInIsrael()} editable={supabaseEnabled} />;
}
