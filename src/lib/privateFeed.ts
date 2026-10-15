import { createClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";
import { buildPlan, defaultPrefs, sessionKey, type Exam, type Plan, type StudyPrefs } from "@/lib/planner";
import { progressKey, type ProgressMap, type Status } from "@/lib/progress";
import { semester, todayInIsrael } from "@/lib/semester";

export interface PrivateFeed {
  prefs: StudyPrefs | null;
  progress: { course_code: string; semester: string; n: string; status: Status }[];
  exams: (Exam & { semester: string })[];
  events: { id: string; date: string; start_time: string | null; end_time: string | null; title: string; kind: string; course_code: string | null; location: string | null }[];
  session_status: Record<string, "done" | "skipped">;
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
      .map((p) => [progressKey(p.course_code, p.n), { status: p.status, grade: null }]),
  );
  const exams = feed.exams.filter((e) => e.semester === semester.semester);
  const busy = feed.events
    .filter((e) => e.start_time && e.end_time && e.kind !== "other")
    .map((e) => ({ date: e.date, start: e.start_time!, end: e.end_time! }));
  const today = todayInIsrael();
  const plan: Plan = buildPlan({ today, prefs: feed.prefs ?? defaultPrefs, progress, exams, busy });
  const live = plan.sessions.filter((s) => feed.session_status[sessionKey(s)] !== "skipped");
  return { feed, progress, exams, today, plan, sessions: live };
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
