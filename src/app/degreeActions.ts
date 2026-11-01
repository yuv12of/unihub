"use server";
import { revalidatePath } from "next/cache";
import { action, must } from "@/app/guard";
import { cleanPlan } from "@/lib/degree";

/** Save the whole degree plan (it is small: one jsonb row per user). */
export async function saveDegreePlan(plan: unknown) {
  return action("saveDegreePlan", async ({ supabase, userId }) => {
    const clean = cleanPlan(plan);
    must(await supabase.from("degree_plans").upsert({ user_id: userId, plan: clean, updated_at: new Date().toISOString() }));
    revalidatePath("/degree");
    return clean;
  });
}
