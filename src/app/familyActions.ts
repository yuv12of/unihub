"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ALLOWED: Record<string, string> = {
  "❤️": "גאים בך",
  "💪": "בהצלחה!",
  "🍀": "בהצלחה בבחינה",
  "☕": "קחו הפסקה",
  "😴": "לכו לישון",
};

/** From the family page (no sign-in): an encouragement that arrives as a notification. Max one per kind per hour. */
export async function familyCheer(token: string, emoji: string, _text: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^[0-9a-f]{48}$/.test(token) || !ALLOWED[emoji]) return { ok: false, error: "לא תקין" };
  const admin = adminClient();
  if (!admin) return { ok: false, error: "לא זמין כרגע" };
  const { data: link } = await admin.from("family_links").select("user_id, name").eq("token", token).maybeSingle();
  if (!link) return { ok: false, error: "הקישור כבר לא פעיל" };
  const hour = new Date().toISOString().slice(0, 13);
  const { error } = await admin.from("notifications").insert({
    user_id: link.user_id,
    kind: "cheer",
    title: `${emoji} ${link.name}: ${ALLOWED[emoji]}`,
    body: "מהדף המשפחתי שלך ב־Unihub",
    url: "/friends#news",
    dedupe: `family|${token.slice(0, 12)}|${emoji}|${hour}`,
  });
  if (error && !/duplicate/i.test(error.message)) return { ok: false, error: "לא נשלח" };
  try {
    const { deliverNotifications } = await import("@/lib/push");
    await deliverNotifications();
  } catch {}
  return { ok: true };
}

async function me() {
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) throw new Error("Not signed in");
  return { sb, userId };
}

/** A new private family link ("Mom", "Dana"). Returns its token. */
export async function createFamilyLink(name: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  const { sb, userId } = await me();
  const n = name.trim().slice(0, 60);
  if (!n) return { ok: false, error: "למי הקישור?" };
  const token = randomBytes(24).toString("hex");
  const { error } = await sb.from("family_links").insert({ token, user_id: userId, name: n });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, token };
}

export async function deleteFamilyLink(token: string) {
  const { sb, userId } = await me();
  await sb.from("family_links").delete().match({ token, user_id: userId });
  refresh();
}
