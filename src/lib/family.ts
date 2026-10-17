/**
 * Family view: a calm, read-only page for parents or a partner, opened with a private link the
 * student creates (family_links). Read on the server with the secret key; shows only a summary:
 * study time, today's progress, the next exam and deadline. No mail, events or friends.
 */
import { adminClient } from "@/lib/supabase/admin";
import { buildFromFeed, restForFeed, type PrivateFeed } from "@/lib/privateFeed";
import { sessionKey, nextExams } from "@/lib/planner";
import { weekStart, streak } from "@/lib/routines";
import { progressKey } from "@/lib/progress";
import { allDeadlines, daysBetween, typeLabel, todayInIsrael } from "@/lib/semester";

export interface FamilyView {
  name: string;
  avatar_url: string | null;
  avatar_emoji: string | null;
  avatar_color: string | null;
  viewer: string;
  todayDone: number;
  todayPlanned: number;
  weekMinutes: number;
  lastWeekMinutes: number;
  nextExam: { course: string; days: number } | null;
  nextDeadline: { title: string; days: number } | null;
  streaks: { title: string; emoji: string; count: number; unit: "days" | "weeks" }[];
}

export async function loadFamily(token: string): Promise<FamilyView | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  const admin = adminClient();
  if (!admin) return null;
  const { data: link } = await admin.from("family_links").select("user_id, name").eq("token", token).maybeSingle();
  if (!link) return null;
  await admin.from("family_links").update({ last_seen: new Date().toISOString() }).eq("token", token);
  const [{ data: profile }, { data: feed }, { data: rows }] = await Promise.all([
    admin.from("profiles").select("name, avatar_url, avatar_emoji, avatar_color, status").eq("id", link.user_id).maybeSingle(),
    admin.rpc("_feed_for", { uid: link.user_id }),
    admin.from("session_status").select("session_key, status, minutes").eq("user_id", link.user_id),
  ]);
  if (!profile || profile.status !== "approved" || !feed) return null;
  const f = { ...(feed as PrivateFeed), subscriptions: [], mails: [], cards_due: 0 };
  const built = buildFromFeed(f, await restForFeed(f));
  const today = todayInIsrael();
  const ws = weekStart(today);
  const lastWs = new Date(Date.parse(ws) - 7 * 86_400_000).toISOString().slice(0, 10);
  let weekMinutes = 0;
  let lastWeekMinutes = 0;
  for (const r of rows ?? []) {
    if (r.status !== "done" || !r.minutes) continue;
    const d = String(r.session_key).split("|")[0];
    if (d >= ws && d <= today) weekMinutes += r.minutes;
    else if (d >= lastWs && d < ws) lastWeekMinutes += r.minutes;
  }
  const todaySessions = built.plan.sessions.filter((s) => s.date === today);
  const todayDone = todaySessions.filter((s) => built.feed.session_status[sessionKey(s)] === "done").length;
  const exam = nextExams(built.exams, today)[0];
  const deadline = allDeadlines(today, built.courses).find((d) => {
    const st = built.progress[progressKey(d.course.code, d.n)]?.status;
    return d.daysLeft >= 0 && st !== "submitted" && st !== "skipped";
  });
  const streaks = built.routines
    .map((r) => ({ title: r.title, emoji: r.emoji ?? "✨", ...streak(r, built.logs, today, built.offDays) }))
    .filter((s) => s.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  return {
    name: (profile.name ?? "").split(" ")[0] || "הסטודנט/ית",
    avatar_url: profile.avatar_url,
    avatar_emoji: profile.avatar_emoji,
    avatar_color: profile.avatar_color,
    viewer: link.name,
    todayDone,
    todayPlanned: todaySessions.length,
    weekMinutes,
    lastWeekMinutes,
    nextExam: exam ? { course: built.courses.find((c) => c.code === exam.course_code)?.name ?? exam.course_code, days: daysBetween(today, exam.date) } : null,
    nextDeadline: deadline ? { title: `${typeLabel[deadline.type]} ${deadline.n} ב${deadline.course.short}`, days: deadline.daysLeft } : null,
    streaks,
  };
}
