"use server";

import { refresh } from "next/cache";
import { allowedEmails, supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { semester } from "@/lib/semester";
import type { Status } from "@/lib/progress";

const STATUSES: Status[] = ["todo", "in_progress", "submitted", "skipped"];

export async function saveProgress(input: {
  code: string;
  n: string;
  status: Status;
  grade?: number | null;
}) {
  const { supabase, userId } = await requireUser();

  const course = semester.courses.find((c) => c.code === input.code);
  if (!course || !course.assignments.some((a) => a.n === input.n)) throw new Error("Unknown assignment");
  if (!STATUSES.includes(input.status)) throw new Error("Bad status");
  const grade =
    input.grade == null || Number.isNaN(input.grade) ? null : Math.max(0, Math.min(100, Math.round(input.grade)));

  const { error } = await supabase.from("assignment_progress").upsert({
    user_id: userId,
    course_code: input.code,
    semester: semester.semester,
    n: input.n,
    status: input.status,
    grade: input.status === "submitted" ? grade : null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  refresh();
}

async function requireUser() {
  if (!supabaseEnabled) throw new Error("Supabase is not configured");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const email = (data?.claims?.email as string | undefined)?.toLowerCase();
  if (!userId || !email) throw new Error("Not signed in");
  if (allowedEmails.length && !allowedEmails.includes(email)) throw new Error("Not allowed");
  return { supabase, userId };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function savePrefs(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const availability: Record<string, { start: string; minutes: number }> = {};
  for (let d = 0; d < 7; d++) {
    const start = String(formData.get(`start-${d}`) ?? "18:00");
    const minutes = formData.get(`on-${d}`) ? Number(formData.get(`minutes-${d}`) ?? 0) : 0;
    if (!TIME.test(start) || !Number.isFinite(minutes) || minutes < 0 || minutes > 600) throw new Error("Bad availability");
    availability[String(d)] = { start, minutes };
  }
  const session = Number(formData.get("session_minutes"));
  if (!Number.isFinite(session) || session < 30 || session > 240) throw new Error("Bad session length");
  const { error } = await supabase.from("study_prefs").upsert({
    user_id: userId,
    availability,
    session_minutes: session,
    fill_routine: formData.get("fill_routine") === "on",
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  refresh();
}

export async function saveExams(formData: FormData) {
  const { supabase, userId } = await requireUser();
  for (const c of semester.courses) {
    for (const moed of ["א", "ב"]) {
      const date = String(formData.get(`date-${c.code}-${moed}`) ?? "");
      const time = String(formData.get(`time-${c.code}-${moed}`) ?? "");
      const key = { user_id: userId, course_code: c.code, semester: semester.semester, moed };
      if (!date) {
        await supabase.from("exams").delete().match(key);
        continue;
      }
      if (!DATE.test(date) || (time && !TIME.test(time))) throw new Error("Bad exam date");
      const { error } = await supabase.from("exams").upsert({ ...key, date, start_time: time || null });
      if (error) throw new Error(error.message);
    }
  }
  refresh();
}

/** Creates the private calendar link, or replaces it (the old link stops working). */
export async function resetFeed() {
  const { supabase, userId } = await requireUser();
  await supabase.from("calendar_feeds").delete().eq("user_id", userId);
  const { error } = await supabase.from("calendar_feeds").insert({ user_id: userId });
  if (error) throw new Error(error.message);
  refresh();
}

/** minutes: how long was actually studied (credited by the planner so the remaining work shrinks). */
export async function setSessionStatus(key: string, status: "done" | "skipped" | null, minutes?: number) {
  const { supabase, userId } = await requireUser();
  if (key.length > 300) throw new Error("Bad key");
  if (status === null) {
    await supabase.from("session_status").delete().match({ user_id: userId, session_key: key });
  } else {
    const m = status === "done" && minutes != null && Number.isFinite(minutes) ? Math.max(0, Math.min(600, Math.round(minutes))) : null;
    const { error } = await supabase
      .from("session_status")
      .upsert({ user_id: userId, session_key: key, status, minutes: m, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }
  refresh();
}

export async function addEvent(input: { date: string; start: string; end: string; title: string }) {
  const { supabase, userId } = await requireUser();
  const title = input.title.trim();
  if (!DATE.test(input.date) || !TIME.test(input.start) || !TIME.test(input.end) || input.end <= input.start)
    throw new Error("Bad time");
  if (!title || title.length > 200) throw new Error("Bad title");
  const { error } = await supabase.from("user_events").insert({
    user_id: userId,
    date: input.date,
    start_time: input.start,
    end_time: input.end,
    title,
    kind: "custom",
    source: "manual",
  });
  if (error) throw new Error(error.message);
  refresh();
}

export async function deleteEvent(id: string) {
  const { supabase, userId } = await requireUser();
  await supabase.from("user_events").delete().match({ id, user_id: userId, source: "manual" });
  refresh();
}

export async function markMailRead(id: string, read = true) {
  const { supabase, userId } = await requireUser();
  await supabase.from("mails").update({ is_read: read }).match({ id, user_id: userId });
  refresh();
}

/** Creates (or replaces) the token the Gmail Apps Script uses to deliver university mail. */
export async function resetIngestToken() {
  const { supabase, userId } = await requireUser();
  await supabase.from("ingest_tokens").delete().eq("user_id", userId);
  const { error } = await supabase.from("ingest_tokens").insert({ user_id: userId });
  if (error) throw new Error(error.message);
  refresh();
}

/** Returns the app's public push key, generating the key pair once if it doesn't exist yet. */
export async function ensurePushKey(): Promise<string> {
  const { supabase } = await requireUser();
  const { data: existing } = await supabase.rpc("vapid_public");
  if (existing) return existing as string;
  const webpush = (await import("web-push")).default;
  const keys = webpush.generateVAPIDKeys();
  const { data, error } = await supabase.rpc("vapid_init", { p_public: keys.publicKey, p_private: keys.privateKey });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function savePushSubscription(sub: { endpoint: string; p256dh: string; auth: string }) {
  const { supabase, userId } = await requireUser();
  if (!/^https:\/\//.test(sub.endpoint)) throw new Error("Bad endpoint");
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ user_id: userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, { onConflict: "endpoint" });
  if (error) throw new Error(error.message);
  refresh();
}

export async function removePushSubscription(endpoint: string) {
  const { supabase, userId } = await requireUser();
  await supabase.from("push_subscriptions").delete().match({ user_id: userId, endpoint });
  refresh();
}

/** Sends a test notification to all of the user's devices. */
export async function sendTestPush() {
  const { supabase } = await requireUser();
  const [{ data: subs }, { data: tok }, { data: pub }] = await Promise.all([
    supabase.from("push_subscriptions").select("endpoint, p256dh, auth"),
    supabase.from("ingest_tokens").select("token").maybeSingle(),
    supabase.rpc("vapid_public"),
  ]);
  if (!tok?.token) throw new Error("חסר חיבור לסקריפט Gmail");
  const { data: priv } = await supabase.rpc("vapid_private", { p_token: tok.token });
  if (!pub || !priv) throw new Error("No push keys");
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails("https://unihub-beta.vercel.app", pub as string, priv as string);
  let ok = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: "Unihub", body: "ההתראות עובדות. נתראה במפגש הלימוד הבא.", url: "/" }),
      );
      ok++;
    } catch {
      /* dead subscription, ignored */
    }
  }
  return ok;
}

/** Spaced repetition (SM-2, simplified). grade: 0 again, 1 hard, 2 good, 3 easy. */
export async function reviewCard(id: string, grade: 0 | 1 | 2 | 3) {
  const { supabase, userId } = await requireUser();
  const { data: c } = await supabase
    .from("cards")
    .select("interval_days, ease, reps, lapses")
    .match({ id, user_id: userId })
    .maybeSingle();
  if (!c) throw new Error("Card not found");
  let { interval_days: interval, ease, reps, lapses } = c;
  if (grade === 0) {
    lapses += 1;
    reps = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    reps += 1;
    ease = Math.max(1.3, ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0));
    interval = reps === 1 ? (grade === 3 ? 3 : 1) : reps === 2 ? (grade === 1 ? 3 : 6) : Math.round(interval * ease * (grade === 1 ? 0.8 : grade === 3 ? 1.3 : 1));
  }
  const due = new Date(Date.now() + (interval === 0 ? 10 * 60_000 : interval * 86_400_000));
  await supabase
    .from("cards")
    .update({ interval_days: interval, ease, reps, lapses, due_at: due.toISOString() })
    .match({ id, user_id: userId });
}

/** Applies a suggested update from mail (grade, moved tutorial …). */
export async function applyUpdate(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("apply_update", { p_id: id });
  if (error) throw new Error(error.message);
  refresh();
}

/** Hides an update (an applied one stays applied). */
export async function dismissUpdate(id: string) {
  const { supabase, userId } = await requireUser();
  await supabase.from("updates").update({ status: "dismissed" }).match({ id, user_id: userId });
  refresh();
}

/** Saves (or removes, when empty) the private Opal calendar export link. */
export async function saveOpalFeed(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const url = String(formData.get("url") ?? "").trim();
  if (!url) {
    await supabase.from("external_feeds").delete().match({ user_id: userId, kind: "opal" });
    await supabase.from("user_events").delete().match({ user_id: userId, source: "opal" });
    refresh();
    return;
  }
  const { isOpalExportUrl } = await import("@/lib/icsParse");
  if (!isOpalExportUrl(url)) throw new Error("זה לא קישור יצוא של לוח השנה באופל");
  const { error } = await supabase
    .from("external_feeds")
    .upsert({ user_id: userId, kind: "opal", url, last_status: "ממתין לסנכרון הראשון", last_synced_at: null });
  if (error) throw new Error(error.message);
  refresh();
}

/** Runs the Opal sync right away (instead of waiting for the hourly run). */
export async function syncOpalNow() {
  const { supabase } = await requireUser();
  const { data: tok } = await supabase.from("ingest_tokens").select("token").maybeSingle();
  if (!tok?.token) throw new Error("חסר חיבור לסקריפט Google");
  const { headers } = await import("next/headers");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const res = await fetch(`${origin}/api/sync`, { method: "POST", headers: { Authorization: `Bearer ${tok.token}` } });
  refresh();
  return (await res.json()) as { opal: string; events?: number; message?: string };
}
