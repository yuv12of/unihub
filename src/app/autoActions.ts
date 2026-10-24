"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnabled } from "@/lib/supabase/config";
import type { Failed } from "@/app/actions";
import { cleanParams, TRIGGER_KINDS, type TriggerKind } from "@/lib/ifthen";

async function g<T>(fn: () => Promise<T>): Promise<T | Failed> {
  try {
    return await fn();
  } catch (e) {
    return { failed: e instanceof Error && e.message ? e.message : "שגיאה" };
  }
}

/** Signed in and approved, or throws. */
async function user() {
  if (!supabaseEnabled) throw new Error("לא מחובר");
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) throw new Error("לא מחובר");
  const { data: profile } = await sb.from("profiles").select("status").maybeSingle();
  if (profile?.status !== "approved") throw new Error("החשבון עוד לא אושר");
  return { sb, userId };
}

const missingTable = (msg: string) => /does not exist|schema cache/i.test(msg);

// ---------- Session agenda ----------

/** Ticks or unticks one step of a session's agenda. Quiet: the checkbox already shows it. */
export async function setSessionStep(sessionKey: string, stepId: string, done: boolean) {
  return g(async () => {
    const { sb, userId } = await user();
    if (!/^\d{4}-\d{2}-\d{2}\|/.test(sessionKey) || sessionKey.length > 300 || !stepId || stepId.length > 300) throw new Error("Bad step");
    const { error } = done
      ? await sb.from("session_steps").upsert({ user_id: userId, session_key: sessionKey, step_id: stepId }, { onConflict: "user_id,session_key,step_id", ignoreDuplicates: true })
      : await sb.from("session_steps").delete().match({ user_id: userId, session_key: sessionKey, step_id: stepId });
    if (error) throw new Error(missingTable(error.message) ? "עוד לא זמין" : "לא נשמר");
    return done;
  });
}

// ---------- If-then plans ----------

export async function saveIfThen(input: { id?: string; kind: TriggerKind; params: Record<string, unknown>; action: string }) {
  return g(async () => {
    const { sb, userId } = await user();
    if (!TRIGGER_KINDS.includes(input.kind)) throw new Error("Bad trigger");
    const action = input.action.trim().slice(0, 200);
    if (!action) throw new Error("מה תעשה/י במקום?");
    const row = { user_id: userId, trigger_kind: input.kind, params: cleanParams(input.kind, input.params), action };
    const { error } = input.id
      ? await sb.from("if_then").update(row).eq("id", input.id)
      : await sb.from("if_then").insert(row);
    if (error) throw new Error(missingTable(error.message) ? "עוד לא זמין" : "לא נשמר");
    refresh();
    return true;
  });
}

export async function setIfThenActive(id: string, active: boolean) {
  return g(async () => {
    const { sb } = await user();
    const { error } = await sb.from("if_then").update({ active }).eq("id", id);
    if (error) throw new Error("לא נשמר");
    refresh();
    return active;
  });
}

export async function deleteIfThen(id: string) {
  return g(async () => {
    const { sb } = await user();
    const { error } = await sb.from("if_then").delete().eq("id", id);
    if (error) throw new Error("לא נמחק");
    refresh();
    return true;
  });
}

// ---------- Practice marks ----------

export async function markPracticeSeen(id: string) {
  return g(async () => {
    const { sb } = await user();
    const { error } = await sb.from("practice_marks").update({ seen: true }).eq("id", id);
    if (error) throw new Error("לא נשמר");
    refresh();
    return true;
  });
}
