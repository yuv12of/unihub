"use server";

import { refresh } from "next/cache";
import { supabaseEnabled } from "@/lib/supabase/config";
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

  const { data: known } = await supabase
    .from("user_courses")
    .select("course_code, course:courses(assignments(n))")
    .match({ course_code: input.code, semester: semester.semester })
    .maybeSingle();
  const ns = ((known?.course as unknown as { assignments: { n: string }[] } | null)?.assignments ?? []).map((a) => a.n);
  if (!ns.includes(input.n)) throw new Error("Unknown assignment");
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
  const { data: profile } = await supabase.from("profiles").select("status, is_admin").maybeSingle();
  if (profile?.status !== "approved") throw new Error("החשבון עוד לא אושר");
  return { supabase, userId, isAdmin: !!profile.is_admin };
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
  const { getCourses } = await import("@/lib/userdata");
  for (const c of await getCourses()) {
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

export async function addEvent(input: { date: string; start: string; end: string; title: string; invite?: string[] }) {
  const { supabase, userId } = await requireUser();
  const title = input.title.trim();
  if (!DATE.test(input.date) || !TIME.test(input.start) || !TIME.test(input.end) || input.end <= input.start)
    throw new Error("Bad time");
  if (!title || title.length > 200) throw new Error("Bad title");
  const { data, error } = await supabase
    .from("user_events")
    .insert({
      user_id: userId,
      date: input.date,
      start_time: input.start,
      end_time: input.end,
      title,
      kind: "custom",
      source: "manual",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (input.invite?.length) await supabase.rpc("invite_to_event", { p_event: data.id, p_users: input.invite });
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

// ---------- Accounts (admin) ----------

export async function setAccountStatus(userId: string, status: "approved" | "blocked" | "pending") {
  const { supabase, isAdmin } = await requireUser();
  if (!isAdmin) throw new Error("Not allowed");
  const { error } = await supabase.rpc("admin_set_status", { p_user: userId, p_status: status });
  if (error) throw new Error(error.message);
  refresh();
}

// ---------- Courses ----------

/** Adds a course by its number: reads the official requirements page and stores it for this user. */
export async function addCourse(codeInput: string) {
  const { supabase, userId } = await requireUser();
  const code = codeInput.trim();
  if (!/^\d{5}$/.test(code)) throw new Error("מספר קורס הוא 5 ספרות");
  const { fetchRequirements } = await import("@/lib/courseCatalog");
  let course = null;
  try {
    course = await fetchRequirements(code, semester.semester);
  } catch {
    /* handled below */
  }
  if (!course) throw new Error(`לא מצאתי את קורס ${code} בסמסטר ${semester.semester}`);
  const { error } = await supabase.rpc("catalog_add_course", { p: course });
  if (error) throw new Error(error.message);
  const { PALETTE_KEYS, defaultShort } = await import("@/lib/semester");
  const { data: mine } = await supabase.from("user_courses").select("color").eq("semester", semester.semester);
  const used = new Set((mine ?? []).map((r) => r.color));
  const color = PALETTE_KEYS.find((k) => !used.has(k)) ?? PALETTE_KEYS[(mine?.length ?? 0) % PALETTE_KEYS.length];
  const { error: e2 } = await supabase
    .from("user_courses")
    .upsert({ user_id: userId, course_code: code, semester: semester.semester, color, short: defaultShort(course.name) }, { ignoreDuplicates: true });
  if (e2) throw new Error(e2.message);
  refresh();
  return course.name;
}

export async function removeCourse(code: string) {
  const { supabase, userId } = await requireUser();
  await supabase.from("user_courses").delete().match({ user_id: userId, course_code: code, semester: semester.semester });
  refresh();
}

export async function updateCourseLook(code: string, look: { color?: string; short?: string }) {
  const { supabase, userId } = await requireUser();
  const { PALETTE } = await import("@/lib/semester");
  const patch: Record<string, string> = {};
  if (look.color && PALETTE[look.color]) patch.color = look.color;
  if (look.short !== undefined) {
    const s = look.short.trim();
    if (!s || s.length > 24) throw new Error("שם קצר: עד 24 תווים");
    patch.short = s;
  }
  await supabase.from("user_courses").update(patch).match({ user_id: userId, course_code: code, semester: semester.semester });
  refresh();
}

// ---------- Routines ----------

export interface RoutineInput {
  id?: string;
  title: string;
  emoji?: string | null;
  category: string;
  mode: "fixed" | "flexible";
  days: number[];
  start_time: string | null;
  minutes: number;
  per_week: number | null;
  time_window: string;
  blocks_study: boolean;
  share_with?: string[];
}

const CATEGORIES = ["sleep", "meal", "sport", "health", "habit", "chore", "hobby", "social", "other"];
const WINDOW_KEYS = ["morning", "noon", "afternoon", "evening", "any"];

export async function saveRoutine(input: RoutineInput) {
  const { supabase, userId } = await requireUser();
  const title = input.title.trim();
  if (!title || title.length > 120) throw new Error("חסר שם");
  if (!CATEGORIES.includes(input.category) || !WINDOW_KEYS.includes(input.time_window)) throw new Error("Bad routine");
  const minutes = Math.max(0, Math.min(900, Math.round(input.minutes || 0)));
  const days = [...new Set(input.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  if (input.mode === "fixed" && days.length === 0) throw new Error("בחרו לפחות יום אחד");
  if (input.start_time && !TIME.test(input.start_time)) throw new Error("שעה לא תקינה");
  const row = {
    user_id: userId,
    title,
    emoji: input.emoji?.trim().slice(0, 8) || null,
    category: input.category,
    mode: input.mode,
    days: input.mode === "fixed" ? days : [],
    start_time: input.mode === "fixed" && minutes > 0 ? input.start_time || null : null,
    minutes,
    per_week: input.mode === "flexible" ? Math.max(1, Math.min(14, Math.round(input.per_week ?? 1))) : null,
    time_window: input.time_window,
    blocks_study: input.blocks_study,
    active: true,
  };
  let id = input.id;
  if (id) {
    const { error } = await supabase.from("routines").update(row).match({ id, user_id: userId });
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase.from("routines").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    id = data.id as string;
  }
  if (input.share_with?.length) await supabase.rpc("share_routine", { p_routine: id, p_users: input.share_with });
  refresh();
}

export async function deleteRoutine(id: string) {
  const { supabase, userId } = await requireUser();
  await supabase.from("routines").delete().match({ id, user_id: userId });
  refresh();
}

/** Ticks (or unticks) a routine for a day. */
export async function toggleRoutine(id: string, date: string, done: boolean) {
  const { supabase, userId } = await requireUser();
  if (!DATE.test(date)) throw new Error("Bad date");
  if (done) {
    const { error } = await supabase.from("routine_logs").upsert({ routine_id: id, user_id: userId, date }, { ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  } else {
    await supabase.from("routine_logs").delete().match({ routine_id: id, user_id: userId, date });
  }
  refresh();
}

export async function shareRoutine(id: string, users: string[]) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("share_routine", { p_routine: id, p_users: users });
  if (error) throw new Error(error.message);
  refresh();
}

/** Join (or decline) a routine someone shared with me; declining after joining = leaving. */
export async function answerRoutine(id: string, accept: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("answer_routine", { p_routine: id, p_accept: accept });
  if (error) throw new Error(error.message);
  refresh();
}

// ---------- Event invitations ----------

export async function answerInvite(eventId: string, status: "accepted" | "declined") {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("answer_invite", { p_event: eventId, p_status: status });
  if (error) throw new Error(error.message);
  refresh();
}

export async function inviteToEvent(eventId: string, users: string[]) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("invite_to_event", { p_event: eventId, p_users: users });
  if (error) throw new Error(error.message);
  refresh();
}

// ---------- Friends ----------

export async function searchPeople(query: string) {
  const { supabase } = await requireUser();
  const q = query.trim();
  if (q.length < 2) return [];
  const { data } = await supabase.rpc("people", { p_query: q });
  return (data ?? []) as { id: string; name: string; avatar_url: string | null; i_follow: string | null; follows_me: string | null }[];
}

export async function followUser(id: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("follow_request", { p_user: id });
  if (error) throw new Error(error.message);
  refresh();
}

export async function answerFollow(followerId: string, accept: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("follow_answer", { p_follower: followerId, p_accept: accept });
  if (error) throw new Error(error.message);
  refresh();
}

/** Stop following someone (or cancel a pending request). */
export async function unfollow(id: string) {
  const { supabase, userId } = await requireUser();
  await supabase.from("follows").delete().match({ follower: userId, followee: id });
  refresh();
}

/** Remove someone who follows me. */
export async function removeFollower(id: string) {
  const { supabase, userId } = await requireUser();
  await supabase.from("follows").delete().match({ follower: id, followee: userId });
  refresh();
}

export interface ShareSettings {
  courses: boolean;
  progress: boolean;
  grades: boolean;
  study: boolean;
  schedule: "none" | "busy" | "details";
  routines: boolean;
}

export async function saveShare(share: ShareSettings) {
  const { supabase, userId } = await requireUser();
  const clean: ShareSettings = {
    courses: !!share.courses,
    progress: !!share.progress && !!share.courses,
    grades: !!share.grades && !!share.progress && !!share.courses,
    study: !!share.study,
    schedule: ["none", "busy", "details"].includes(share.schedule) ? share.schedule : "busy",
    routines: !!share.routines,
  };
  const { error } = await supabase.from("profiles").update({ share: clean }).eq("id", userId);
  if (error) throw new Error(error.message);
  refresh();
}
