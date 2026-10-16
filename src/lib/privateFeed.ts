import { createClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";
import { defaultPrefs, sessionKey, type Exam, type Plan, type StudyPrefs } from "@/lib/planner";
import { coursesFor, progressKey, type ProgressMap, type Status } from "@/lib/progress";
import { planFor } from "@/lib/planfor";
import { semester, todayInIsrael } from "@/lib/semester";

export interface PrivateFeed {
  prefs: StudyPrefs | null;
  progress: { course_code: string; semester: string; n: string; status: Status; grade: number | null; due_override: string | null }[];
  exams: (Exam & { semester: string })[];
  events: { id: string; date: string; start_time: string | null; end_time: string | null; title: string; kind: "custom" | "tutorial" | "other"; course_code: string | null; location: string | null; cancelled: boolean; source: string }[];
  session_status: Record<string, "done" | "skipped">;
  session_minutes: Record<string, number>;
  updates_pending: number;
  mails: { subject: string | null; summary: string | null; category: string | null; received_at: string }[];
  cards_due: number;
  subscriptions: { endpoint: string; p256dh: string; auth: string }[];
}

export const anonClient = () => createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

export function bearer(req: Request) {
  const t = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return /^[0-9a-f]{48}$/.test(t) ? t : null;
}

/** Loads the user's data through the Apps Script token and computes today's plan. */
export async function loadPrivate(token: string) {
  const { data, error } = await anonClient().rpc("private_feed", { p_token: token });
  if (error || !data) return null;
  const feed = data as PrivateFeed;
  const progress: ProgressMap = Object.fromEntries(
    feed.progress
      .filter((p) => p.semester === semester.semester)
      .map((p) => [progressKey(p.course_code, p.n), { status: p.status, grade: p.grade, due: p.due_override }]),
  );
  const exams = feed.exams.filter((e) => e.semester === semester.semester);
  const today = todayInIsrael();
  const rows = Object.entries(feed.session_status).map(([session_key, status]) => ({
    session_key,
    status,
    minutes: feed.session_minutes?.[session_key] ?? null,
  }));
  const plan: Plan = planFor({ today, prefs: feed.prefs ?? defaultPrefs, progress, exams, events: feed.events, rows });
  const live = plan.sessions.filter((s) => feed.session_status[sessionKey(s)] !== "skipped");
  return { feed, progress, exams, today, plan, sessions: live, courses: coursesFor(progress) };
}

/** Current Israel time as { date: YYYY-MM-DD, minutes since midnight }. */
export function israelNow(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  const m = Number(parts.find((p) => p.type === "minute")!.value);
  return { date: todayInIsrael(d), minutes: h * 60 + m };
}
