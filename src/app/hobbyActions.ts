"use server";

import { refresh } from "next/cache";
import { action, must } from "@/app/guard";
import { KINDS, type HobbyKind, type ItemStatus } from "@/lib/hobbyMeta";
import { todayInIsrael } from "@/lib/semester";



const DATE = /^\d{4}-\d{2}-\d{2}$/;
const cleanUrl = (u?: string | null) => {
  const s = (u ?? "").trim();
  if (!s) return null;
  try {
    const url = new URL(s);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
};

/** Weekly time → a flexible routine: sessions of about an hour, never more than one a day. */
function sessionsFor(weekly: number) {
  const per = Math.max(1, Math.min(7, Math.round(weekly / 60)));
  const minutes = Math.max(15, Math.round(weekly / per / 5) * 5);
  return { per, minutes };
}

export async function createHobby(input: { title: string; emoji?: string; kind: HobbyKind; weekly: number; why?: string; items?: string[]; schedule?: boolean }) {
  return action("createHobby", async ({ supabase: sb, userId: uid }) => {
    const title = input.title.trim().slice(0, 60);
    if (!title) throw new Error("איך קוראים לתחביב?");
    const kind: HobbyKind = input.kind in KINDS ? input.kind : "other";
    const weekly = Math.max(0, Math.min(1200, Math.round(input.weekly || 0)));
    const emoji = [...(input.emoji ?? "").trim()].slice(0, 4).join("") || KINDS[kind].emoji;
    const id = crypto.randomUUID();
    let routineId: string | null = null;
    if (input.schedule !== false && weekly > 0) {
      const { per, minutes } = sessionsFor(weekly);
      routineId = crypto.randomUUID();
      const { error } = await sb.from("routines").insert({
        id: routineId,
        user_id: uid,
        title,
        emoji,
        category: "hobby",
        mode: "flexible",
        days: [],
        start_time: null,
        minutes,
        per_week: per,
        time_window: "any",
        blocks_study: true,
        active: true,
        starts_on: todayInIsrael(),
      });
      if (error) throw new Error(error.message);
    }
    const { error } = await sb.from("hobbies").insert({ id, user_id: uid, title, emoji, kind, weekly_minutes: weekly, routine_id: routineId, why: input.why?.trim().slice(0, 300) || null });
    if (error) throw new Error(error.message);
    const items = (input.items ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 20);
    if (items.length) await sb.from("hobby_items").insert(items.map((t, i) => ({ user_id: uid, hobby_id: id, title: t.slice(0, 120), sort: i })));
    refresh();
    return id;
  });
}

export async function updateHobby(id: string, patch: { title?: string; emoji?: string; weekly?: number; why?: string; archived?: boolean }) {
  return action("updateHobby", async ({ supabase: sb, userId: uid }) => {
    const { data: h } = await sb.from("hobbies").select("routine_id, title, emoji").match({ id, user_id: uid }).maybeSingle();
    if (!h) throw new Error("לא נמצא");
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row.title = patch.title.trim().slice(0, 60) || h.title;
    if (patch.emoji !== undefined) row.emoji = [...patch.emoji.trim()].slice(0, 4).join("") || h.emoji;
    if (patch.why !== undefined) row.why = patch.why.trim().slice(0, 300) || null;
    if (patch.archived !== undefined) row.archived = patch.archived;
    if (patch.weekly !== undefined) row.weekly_minutes = Math.max(0, Math.min(1200, Math.round(patch.weekly)));
    const { error } = await sb.from("hobbies").update(row).match({ id, user_id: uid });
    if (error) throw new Error(error.message);
    // Keep the calendar routine in step: time per week, name, paused when archived.
    const weekly = row.weekly_minutes as number | undefined;
    if (h.routine_id) {
      const r: Record<string, unknown> = {};
      if (row.title) r.title = row.title;
      if (row.emoji) r.emoji = row.emoji;
      if (weekly !== undefined) {
        if (weekly > 0) Object.assign(r, (({ per, minutes }) => ({ per_week: per, minutes }))(sessionsFor(weekly)));
        r.active = weekly > 0 && !patch.archived;
      }
      if (patch.archived !== undefined) r.active = !patch.archived && (weekly ?? 1) > 0;
      if (Object.keys(r).length) await sb.from("routines").update(r).match({ id: h.routine_id, user_id: uid });
    } else if (weekly && weekly > 0 && !patch.archived) {
      const { data: cur } = await sb.from("hobbies").select("title, emoji").eq("id", id).single();
      const { per, minutes } = sessionsFor(weekly);
      const routineId = crypto.randomUUID();
      must(await sb.from("routines").insert({ id: routineId, user_id: uid, title: cur!.title, emoji: cur!.emoji, category: "hobby", mode: "flexible", days: [], start_time: null, minutes, per_week: per, time_window: "any", blocks_study: true, active: true, starts_on: todayInIsrael() }));
      must(await sb.from("hobbies").update({ routine_id: routineId }).match({ id, user_id: uid }));
    }
    refresh();
    return true;
  });
}

export async function deleteHobby(id: string) {
  return action("deleteHobby", async ({ supabase: sb, userId: uid }) => {
    const { data: h } = await sb.from("hobbies").select("routine_id").match({ id, user_id: uid }).maybeSingle();
    must(await sb.from("hobbies").delete().match({ id, user_id: uid }));
    if (h?.routine_id) await sb.from("routines").delete().match({ id: h.routine_id, user_id: uid });
    refresh();
    return true;
  });
}

export async function logHobby(input: { hobby_id: string; minutes: number; date?: string; note?: string; mood?: number | null; item_id?: string | null }) {
  return action("logHobby", async ({ supabase: sb, userId: uid }) => {
    const minutes = Math.round(input.minutes);
    if (!(minutes >= 1 && minutes <= 720)) throw new Error("כמה דקות?");
    const date = input.date && DATE.test(input.date) ? input.date : todayInIsrael();
    const mood = input.mood && input.mood >= 1 && input.mood <= 5 ? Math.round(input.mood) : null;
    const { error } = await sb.from("hobby_logs").insert({ user_id: uid, hobby_id: input.hobby_id, minutes, date, note: input.note?.trim().slice(0, 500) || null, mood, item_id: input.item_id || null });
    if (error) throw new Error(error.message);
    // Practising counts as doing the hobby's routine that day.
    const { data: h } = await sb.from("hobbies").select("routine_id").match({ id: input.hobby_id, user_id: uid }).maybeSingle();
    if (h?.routine_id) await sb.from("routine_logs").upsert({ routine_id: h.routine_id, user_id: uid, date }, { onConflict: "routine_id,user_id,date", ignoreDuplicates: true });
    refresh();
    return true;
  });
}

export async function deleteHobbyLog(id: string) {
  return action("deleteHobbyLog", async ({ supabase: sb, userId: uid }) => {
    must(await sb.from("hobby_logs").delete().match({ id, user_id: uid }));
    refresh();
    return true;
  });
}

export async function addHobbyItem(input: { hobby_id: string; title: string; url?: string; status?: ItemStatus }) {
  return action("addHobbyItem", async ({ supabase: sb, userId: uid }) => {
    const title = input.title.trim().slice(0, 120);
    if (!title) throw new Error("מה להוסיף?");
    const status: ItemStatus = input.status === "doing" || input.status === "done" ? input.status : "want";
    const { error } = await sb.from("hobby_items").insert({ user_id: uid, hobby_id: input.hobby_id, title, url: cleanUrl(input.url), status, sort: Date.now() % 1_000_000_000, done_at: status === "done" ? new Date().toISOString() : null });
    if (error) throw new Error(error.message);
    refresh();
    return true;
  });
}

export async function updateHobbyItem(id: string, patch: { status?: ItemStatus; progress?: number; note?: string; title?: string; url?: string }) {
  return action("updateHobbyItem", async ({ supabase: sb, userId: uid }) => {
    const row: Record<string, unknown> = {};
    if (patch.status) {
      row.status = patch.status;
      row.done_at = patch.status === "done" ? new Date().toISOString() : null;
      if (patch.status === "done") row.progress = 100;
    }
    if (patch.progress !== undefined) row.progress = Math.max(0, Math.min(100, Math.round(patch.progress)));
    if (patch.note !== undefined) row.note = patch.note.trim().slice(0, 500) || null;
    if (patch.title !== undefined && patch.title.trim()) row.title = patch.title.trim().slice(0, 120);
    if (patch.url !== undefined) row.url = cleanUrl(patch.url);
    const { error } = await sb.from("hobby_items").update(row).match({ id, user_id: uid });
    if (error) throw new Error(error.message);
    refresh();
    return true;
  });
}

export async function deleteHobbyItem(id: string) {
  return action("deleteHobbyItem", async ({ supabase: sb, userId: uid }) => {
    must(await sb.from("hobby_items").delete().match({ id, user_id: uid }));
    refresh();
    return true;
  });
}
