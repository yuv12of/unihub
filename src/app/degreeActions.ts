"use server";
import { revalidatePath } from "next/cache";
import { action, must } from "@/app/guard";
import { cleanPlan, cleanScenarios, DEFAULT_SETTINGS, type DegreePlan } from "@/lib/degree";
import { applySync, parseSheilta, type SheiltaSnapshot, type SyncChange } from "@/lib/sheilta";
import { CURRENT_SEMESTER } from "@/lib/semester";

const refresh = () => {
  revalidatePath("/degree");
  revalidatePath("/");
};

/** Save the whole degree plan (it is small: one jsonb row per user). */
export async function saveDegreePlan(plan: unknown) {
  return action("saveDegreePlan", async ({ supabase, userId }) => {
    const clean = cleanPlan(plan);
    must(await supabase.from("degree_plans").upsert({ user_id: userId, plan: clean, updated_at: new Date().toISOString() }));
    refresh();
    return clean;
  });
}

/** Save the what-if versions (all of them; at most five). */
export async function saveScenarios(scenarios: unknown) {
  return action("saveScenarios", async ({ supabase, userId }) => {
    const clean = cleanScenarios(scenarios);
    const { data } = await supabase.from("degree_plans").select("user_id").eq("user_id", userId).maybeSingle();
    if (!data) throw new Error("קודם צריך תכנית ראשית");
    must(await supabase.from("degree_plans").update({ scenarios: clean, updated_at: new Date().toISOString() }).eq("user_id", userId));
    refresh();
    return clean;
  });
}

/**
 * Courses and grades from Sheilta (the bookmarklet's rows, or the endpoint JSON pasted by hand):
 * stores the snapshot and applies passes, grades and failed attempts to the plan and every scenario.
 */
export async function importSheilta(input: unknown) {
  return action("importSheilta", async ({ supabase, userId }) => {
    const current = CURRENT_SEMESTER.code;
    const records = parseSheilta(input, current);
    if (!records.length) throw new Error("לא נמצאו קורסים בנתונים. להיכנס לשאילתא ולנסות שוב.");
    const { data: row } = await supabase.from("degree_plans").select("plan, scenarios").eq("user_id", userId).maybeSingle();
    const plan: DegreePlan = row?.plan ? cleanPlan(row.plan) : { program: "AF", items: [], recognized: [], settings: DEFAULT_SETTINGS };
    const main = applySync(plan, records, current);
    const scenarios = cleanScenarios(row?.scenarios ?? []).map((s) => ({ ...s, plan: applySync(s.plan, records, current).plan }));
    const snapshot: SheiltaSnapshot = { syncedAt: new Date().toISOString(), records };
    must(
      await supabase
        .from("degree_plans")
        .upsert({ user_id: userId, plan: main.plan, scenarios, sheilta: snapshot, updated_at: snapshot.syncedAt }),
    );
    refresh();
    return { changes: main.changes as SyncChange[], count: records.length, syncedAt: snapshot.syncedAt };
  });
}
