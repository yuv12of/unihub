import { Suspense } from "react";
import { connection } from "next/server";
import { DegreePlanner } from "@/components/DegreePlanner";
import { getCourses } from "@/lib/userdata";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { cleanPlan, DEFAULT_SETTINGS, type DegreePlan } from "@/lib/degree";
import { CURRENT_SEMESTER } from "@/lib/semester";

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
  if (supabaseEnabled) {
    const sb = await createClient();
    const { data } = await sb.from("degree_plans").select("plan").maybeSingle();
    if (data?.plan) plan = cleanPlan(data.plan);
  }
  if (!plan) {
    // a first plan: this semester's courses; the rest is added on the page
    const courses = await getCourses();
    plan = { program: "AF", items: courses.map((c) => ({ code: c.code, sem: current })), recognized: [], settings: DEFAULT_SETTINGS };
  }
  return <DegreePlanner initial={plan} current={current} editable={supabaseEnabled} />;
}
