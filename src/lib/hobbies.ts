import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/semester";
import type { Hobby, HobbyItem, HobbyLog } from "@/lib/hobbyMeta";

export * from "@/lib/hobbyMeta";

export async function getHobbies(): Promise<{ hobbies: Hobby[]; items: HobbyItem[]; logs: HobbyLog[] }> {
  if (!supabaseEnabled) return { hobbies: [], items: [], logs: [] };
  const sb = await createClient();
  const since = addDays(new Date().toISOString().slice(0, 10), -400);
  const [{ data: hobbies }, { data: items }, { data: logs }] = await Promise.all([
    sb.from("hobbies").select("id, title, emoji, kind, weekly_minutes, routine_id, why, archived, created_at").order("created_at"),
    sb.from("hobby_items").select("id, hobby_id, title, kind, status, progress, note, url, sort, done_at").order("sort").order("created_at"),
    sb.from("hobby_logs").select("id, hobby_id, item_id, date, minutes, note, mood, routine_date").gte("date", since).order("date", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  return { hobbies: (hobbies ?? []) as Hobby[], items: (items ?? []) as HobbyItem[], logs: (logs ?? []) as HobbyLog[] };
}

