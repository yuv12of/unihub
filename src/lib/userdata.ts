import { cache } from "react";
import semesterData from "@/data/semester-2027a.json";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { addDays, courseFromRow, semester, todayInIsrael, type Course, type CourseRow } from "@/lib/semester";
import { restFor } from "@/lib/hebcal";
import { defaultPrefs, type Exam, type Plan, type StudyPrefs } from "@/lib/planner";
import { planFor } from "@/lib/planfor";
import type { Routine, RoutineLog } from "@/lib/routines";
import { coursesFor, getProgress, type ProgressMap } from "@/lib/progress";

/** The signed-in user's id (null when signed out). */
export const getUserId = cache(async (): Promise<string | null> => {
  if (!supabaseEnabled) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.sub as string | undefined) ?? null;
});

export interface RoutineWithMembers extends Routine {
  /** "owner", "accepted" (shared with me and I joined) or "pending" (invited) */
  role: "owner" | "accepted" | "pending";
  members: { user_id: string; status: "pending" | "accepted" }[];
}

/** Routines I own or share. Pending invitations are included with role "pending". */
export const getRoutines = cache(async (): Promise<RoutineWithMembers[]> => {
  if (!supabaseEnabled) return [];
  const me = await getUserId();
  const supabase = await createClient();
  const { data } = await supabase
    .from("routines")
    .select("*, members:routine_members(user_id, status)")
    .order("created_at");
  return ((data ?? []) as (Routine & { members: RoutineWithMembers["members"] })[]).map((r) => ({
    ...r,
    role: r.user_id === me ? "owner" : (r.members.find((m) => m.user_id === me)?.status ?? "pending"),
  }));
});

/** Check-offs of the last 10 weeks: mine, and those of people I share routines with. */
export const getRoutineLogs = cache(async (): Promise<RoutineLog[]> => {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const since = new Date(Date.now() - 70 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase.from("routine_logs").select("routine_id, user_id, date").gte("date", since);
  return (data ?? []) as RoutineLog[];
});

/** The signed-in user's courses this semester (catalog data + their own colour and short name). */
export const getCourses = cache(async (): Promise<Course[]> => {
  if (!supabaseEnabled) return process.env.UNIHUB_DEMO ? demoCourses() : [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_courses")
    .select(
      "color, short, added_at, course:courses(code, name, name_en, opal_id, coordinator, final_assessment, min_weight, max_weight, rules, assignments(n, type, weight, due))",
    )
    .eq("semester", semester.semester)
    .order("added_at");
  return (data ?? [])
    .filter((r) => r.course)
    .map((r) => {
      const c = r.course as unknown as Omit<CourseRow, "color" | "short">;
      return courseFromRow({ ...c, color: r.color, short: r.short });
    });
});

/** Local design previews only (env UNIHUB_DEMO, no database): the bundled semester's courses. */
function demoCourses(): Course[] {
  const colors = ["blue", "purple", "green", "orange"];
  return ((semesterData as { courses?: { code: string; name: string; nameEn?: string; opalId?: number; coordinator?: string; finalAssessment?: string; assignmentWeight: { min: number; max: number }; assignments: CourseRow["assignments"] }[] }).courses ?? []).map((c, i) =>
    courseFromRow({ code: c.code, name: c.name, name_en: c.nameEn, opal_id: c.opalId, coordinator: c.coordinator, final_assessment: c.finalAssessment, min_weight: c.assignmentWeight.min, max_weight: c.assignmentWeight.max, assignments: c.assignments, color: colors[i % 4] }),
  );
}

/** Signed-in user's exam dates for the current semester. */
export async function getExams(): Promise<Exam[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("exams")
    .select("course_code, moed, date, start_time")
    .eq("semester", semester.semester)
    .order("date");
  return (data ?? []) as Exam[];
}

export async function getPrefs(): Promise<StudyPrefs> {
  if (!supabaseEnabled) return defaultPrefs;
  const supabase = await createClient();
  const { data } = await supabase
    .from("study_prefs")
    .select("availability, session_minutes, fill_routine, jewish, weekly_goal_minutes, focus")
    .maybeSingle();
  return data ? { ...defaultPrefs, ...(data as StudyPrefs) } : defaultPrefs;
}

/** The private calendar feed token, or null if the user hasn't created one yet. */
export async function getFeedToken(): Promise<string | null> {
  if (!supabaseEnabled) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("calendar_feeds").select("token").maybeSingle();
  return data?.token ?? null;
}


export interface UserEvent {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  kind: "custom" | "tutorial" | "other";
  course_code: string | null;
  location: string | null;
  source: string;
  cancelled: boolean;
  /** repeating events: one row per date sharing this id and rule */
  series_id?: string | null;
  repeat?: import("@/lib/repeat").Repeat | null;
  user_id?: string;
  /** set when this is someone else's event I was invited to */
  invited_by?: string;
  /** people I invited to my event */
  guests?: { invitee: string; status: "pending" | "accepted" | "declined" }[];
}

const EVENT_COLS = "id, user_id, date, start_time, end_time, title, kind, course_code, location, source, cancelled, series_id, repeat";

/** My own events (with who I invited) plus events I accepted an invitation to. */
export const getEvents = cache(async (): Promise<UserEvent[]> => {
  if (!supabaseEnabled) return [];
  const me = await getUserId();
  const supabase = await createClient();
  const [{ data: own }, { data: invited }] = await Promise.all([
    supabase.from("user_events").select(`${EVENT_COLS}, guests:event_invites(invitee, status)`).eq("user_id", me ?? "").order("date"),
    supabase.from("event_invites").select(`status, inviter, event:user_events(${EVENT_COLS})`).eq("invitee", me ?? "").eq("status", "accepted"),
  ]);
  const mine = (own ?? []) as unknown as UserEvent[];
  const theirs = (invited ?? [])
    .filter((i) => i.event)
    .map((i) => ({ ...(i.event as unknown as UserEvent), invited_by: i.inviter as string, guests: [] }));
  return [...mine, ...theirs].sort((a, b) => a.date.localeCompare(b.date));
});

export interface Invite {
  status: "pending" | "accepted" | "declined";
  inviter: string;
  event: UserEvent;
}

/** Invitations waiting for my answer. */
export async function getPendingInvites(): Promise<Invite[]> {
  if (!supabaseEnabled) return [];
  const me = await getUserId();
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_invites")
    .select(`status, inviter, event:user_events(${EVENT_COLS})`)
    .eq("invitee", me ?? "")
    .eq("status", "pending");
  return ((data ?? []) as unknown as Invite[]).filter((i) => i.event && i.event.date >= todayInIsrael());
}

export async function getSessionRows(): Promise<{ session_key: string; status: "done" | "skipped"; minutes: number | null }[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("session_status").select("session_key, status, minutes");
  return data ?? [];
}


export interface UserPlan {
  progress: ProgressMap;
  exams: Exam[];
  prefs: StudyPrefs;
  events: UserEvent[];
  status: Record<string, "done" | "skipped">;
  plan: Plan;
  /** Courses with this user's deadline extensions applied. */
  courses: Course[];
  routines: RoutineWithMembers[];
  /** my own routine check-offs */
  logs: RoutineLog[];
  /** check-offs including people I share routines with */
  allLogs: RoutineLog[];
  me: string | null;
  /** rough days + (in rest mode) Shabbat and Yom Tov: no plan, streaks protected */
  offDays: string[];
  /** only the rough days the user marked */
  manualOff: string[];
}


/** Everything needed to show the plan, loaded in parallel. */
export async function getUserPlan(today: string): Promise<UserPlan> {
  const [progress, exams, prefs, events, rows, base, allRoutines, allLogs, me, offDays] = await Promise.all([
    getProgress(),
    getExams(),
    getPrefs(),
    getEvents(),
    getSessionRows(),
    getCourses(),
    getRoutines(),
    getRoutineLogs(),
    getUserId(),
    getOffDays(),
  ]);
  const status = Object.fromEntries(rows.map((r) => [r.session_key, r.status]));
  const routines = allRoutines.filter((r) => r.role !== "pending" && r.active);
  const logs = allLogs.filter((l) => l.user_id === me);
  const rest = await restFor(prefs.jewish, addDays(today, -60), addDays(today, 240));
  const allOff = [...offDays, ...rest.offDays];
  const plan = planFor({ today, prefs, progress, exams, events, rows, courses: base, routines, offDays: allOff, extraBusy: rest.busy });
  return { progress, exams, prefs, events, status, plan, courses: coursesFor(progress, base), routines, logs, allLogs, me, offDays: allOff, manualOff: offDays };
}

export async function getIngestToken(): Promise<string | null> {
  if (!supabaseEnabled) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("ingest_tokens").select("token").maybeSingle();
  return data?.token ?? null;
}

export interface Mail {
  id: string;
  sender: string | null;
  subject: string | null;
  received_at: string;
  body_text: string | null;
  body_html?: string | null;
  summary: string | null;
  category: string | null;
  action_items: { text: string; date?: string }[] | null;
  is_read: boolean;
  attachments: { id: string; filename: string | null; size_bytes: number | null }[];
}

export async function getMails(limit = 200): Promise<Mail[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("mails")
    .select(
      // body_html is left out: it can be megabytes; the open message loads it on its own (mailHtml).
      "id, sender, subject, received_at, body_text, summary, category, action_items, is_read, attachments:mail_attachments(id, filename, size_bytes)",
    )
    .order("received_at", { ascending: false })
    .limit(limit);
  // The same message sometimes arrives twice (forwarded / two labels): show it once.
  const seen = new Set<string>();
  return ((data ?? []) as Mail[]).filter((m) => {
    const k = `${m.subject ?? ""}|${(m.received_at ?? "").slice(0, 13)}|${(m.body_text ?? m.summary ?? "").replace(/\s+/g, " ").slice(0, 300)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export interface Card {
  id: string;
  course_code: string;
  topic: string | null;
  kind: "mcq" | "flash";
  front: string;
  back: string | null;
  options: string[] | null;
  answer_index: number | null;
  explanation: string | null;
  due_at: string;
  reps: number;
}

export async function getCardStats(): Promise<{ due: Card[]; total: number; byCourse: Record<string, { total: number; due: number }> }> {
  if (!supabaseEnabled) return { due: [], total: 0, byCourse: {} };
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [{ data: due }, { data: all }] = await Promise.all([
    supabase
      .from("cards")
      .select("id, course_code, topic, kind, front, back, options, answer_index, explanation, due_at, reps")
      .lte("due_at", now)
      .order("due_at")
      .limit(60),
    supabase.from("cards").select("course_code, due_at"),
  ]);
  const byCourse: Record<string, { total: number; due: number }> = {};
  for (const c of all ?? []) {
    byCourse[c.course_code] ??= { total: 0, due: 0 };
    byCourse[c.course_code].total++;
    if (c.due_at <= now) byCourse[c.course_code].due++;
  }
  return { due: (due ?? []) as Card[], total: all?.length ?? 0, byCourse };
}

export interface Note {
  id: string;
  name: string;
  folder: string | null;
  course_code: string | null;
  url: string | null;
  modified_at: string | null;
  summary: string | null;
  has_text: boolean;
}

export async function getNotes(): Promise<Note[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("notes")
    .select("id, name, folder, course_code, url, modified_at, summary, text_content")
    .order("modified_at", { ascending: false })
    .limit(300);
  return (data ?? []).map(({ text_content, ...n }) => ({ ...n, has_text: !!text_content?.trim() })) as Note[];
}

export interface Update {
  id: string;
  kind: "deadline" | "tutorial_cancel" | "tutorial_new" | "grade" | "info";
  title: string;
  detail: string | null;
  status: "pending" | "applied" | "dismissed";
  created_at: string;
  mail_id: string | null;
}

/** Pending updates from mail, plus ones applied automatically in the last 5 days. */
export async function getUpdates(): Promise<Update[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const since = new Date(Date.now() - 5 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("updates")
    .select("id, kind, title, detail, status, created_at, mail_id")
    .or(`status.eq.pending,and(status.eq.applied,created_at.gte.${since})`)
    .order("created_at", { ascending: false })
    .limit(12);
  return (data ?? []) as Update[];
}

export interface OpalFeed {
  url: string;
  last_synced_at: string | null;
  last_status: string | null;
  last_count: number | null;
}

export async function getOpalFeed(): Promise<OpalFeed | null> {
  if (!supabaseEnabled) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("external_feeds").select("url, last_synced_at, last_status, last_count").eq("kind", "opal").maybeSingle();
  // The page only needs to show that a link is saved; the key part never goes to the browser.
  return data ? { ...data, url: data.url.replace(/authtoken=[^&]+/, "authtoken=••••") } : null;
}

export async function getGoogleFeed(): Promise<OpalFeed | null> {
  if (!supabaseEnabled) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("external_feeds").select("url, last_synced_at, last_status, last_count").eq("kind", "google").maybeSingle();
  return data ? { ...data, url: data.url.replace(/private-[0-9a-f]+/, "private-••••") } : null;
}

/** Whether this user connected Spotify (cheap check, so players render only for them). */
export const hasSpotify = cache(async (): Promise<boolean> => {
  if (!supabaseEnabled || !process.env.SPOTIFY_CLIENT_ID) return false;
  const supabase = await createClient();
  const { count } = await supabase.from("spotify_tokens").select("user_id", { count: "exact", head: true });
  return (count ?? 0) > 0;
});

export interface Review {
  course_code: string;
  n: string;
  minutes_spent: number | null;
  difficulty: number | null;
  hard: string | null;
}

/** My assignment autopsies for this semester. */
export async function getReviews(): Promise<Review[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("assignment_reviews").select("course_code, n, minutes_spent, difficulty, hard").eq("semester", semester.semester);
  return (data ?? []) as Review[];
}

export interface StuckPoint {
  id: string;
  course_code: string | null;
  topic: string;
  resolved: boolean;
  created_at: string;
}

export async function getStuck(): Promise<StuckPoint[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("stuck_points").select("id, course_code, topic, resolved, created_at").order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as StuckPoint[];
}

/** Minutes logged per assignment ("code|n"), from study sessions marked done. */
export async function getSpentByAssignment(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const r of await getSessionRows()) {
    if (r.status !== "done" || !r.minutes) continue;
    const [, kind, code, ref] = r.session_key.split("|");
    if (kind === "assignment" && ref?.startsWith("a")) out[`${code}|${ref.slice(1)}`] = (out[`${code}|${ref.slice(1)}`] ?? 0) + r.minutes;
  }
  return out;
}

export async function getFamilyLinks(): Promise<{ token: string; name: string; last_seen: string | null }[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("family_links").select("token, name, last_seen").order("created_at");
  return data ?? [];
}

export async function hasPushSubscription(): Promise<boolean> {
  if (!supabaseEnabled) return false;
  const supabase = await createClient();
  const { count } = await supabase.from("push_subscriptions").select("endpoint", { count: "exact", head: true });
  return (count ?? 0) > 0;
}

export interface Person {
  id: string;
  name: string;
  avatar_url: string | null;
  avatar_emoji?: string | null;
  avatar_color?: string | null;
  program?: string | null;
  i_follow?: "pending" | "accepted" | null;
  follows_me?: "pending" | "accepted" | null;
}

/** People I'm connected with (either direction), or a search among approved users. */
export async function getPeople(query = ""): Promise<Person[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("people", { p_query: query });
  return (data ?? []) as Person[];
}

/** Names and pictures for a set of user ids (approved users only). */
export async function getNames(ids: string[]): Promise<Record<string, Person>> {
  if (!supabaseEnabled || ids.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase.rpc("names_for", { p_ids: [...new Set(ids)] });
  return Object.fromEntries(((data ?? []) as Person[]).map((p) => [p.id, p]));
}

/** People who asked to follow me. */
export async function getFollowRequests(): Promise<string[]> {
  if (!supabaseEnabled) return [];
  const me = await getUserId();
  const supabase = await createClient();
  const { data } = await supabase.from("follows").select("follower").eq("followee", me ?? "").eq("status", "pending");
  return (data ?? []).map((r) => r.follower as string);
}

export async function getShare() {
  if (!supabaseEnabled) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("share, is_admin").maybeSingle();
  return data as { share: import("@/app/actions").ShareSettings; is_admin: boolean } | null;
}

export async function getFriendView(id: string): Promise<import("@/lib/friends").FriendRaw | null> {
  if (!supabaseEnabled) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("friend_view", { p_user: id });
  return (data ?? null) as import("@/lib/friends").FriendRaw | null;
}

/** Counts for the little dots in the navigation. */
export const getBadges = cache(async (): Promise<{ friends?: number; admin?: number | null }> => {
  if (!supabaseEnabled) return {};
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_badges");
  return (data ?? {}) as { friends?: number; admin?: number | null };
});

/** My rough days (sick, reserve duty…) of the last few months and ahead. */
export const getOffDays = cache(async (): Promise<string[]> => {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const since = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase.from("day_off").select("date").gte("date", since);
  return (data ?? []).map((r) => r.date as string);
});

export interface LiveStudy {
  user_id: string;
  title: string;
  started_at: string;
  ends_at: string;
  with_user: string | null;
}

/** Friends studying right now (only those who share their study hours with me). */
export async function getStudyingNow(): Promise<LiveStudy[]> {
  if (!supabaseEnabled) return [];
  const me = await getUserId();
  const supabase = await createClient();
  const { data } = await supabase
    .from("study_live")
    .select("user_id, title, started_at, ends_at, with_user")
    .gt("ends_at", new Date().toISOString())
    .neq("user_id", me ?? "");
  return (data ?? []) as LiveStudy[];
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string;
  created_at: string;
  read_at: string | null;
  actor: string | null;
}

export async function getNotifications(limit = 20): Promise<AppNotification[]> {
  if (!supabaseEnabled) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, url, created_at, read_at, actor")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AppNotification[];
}

/** Study minutes per day (from sessions marked done), for the heatmap and the league. */
export async function getMyStudyDays(): Promise<Record<string, number>> {
  const rows = await getSessionRows();
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.status !== "done" || !r.minutes) continue;
    const d = r.session_key.split("|")[0];
    out[d] = (out[d] ?? 0) + r.minutes;
  }
  return out;
}

export interface MyProfile {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  avatar_emoji: string | null;
  avatar_color: string | null;
  bio: string | null;
  program: string | null;
  study_year: string | null;
  weekly_goal_minutes: number | null;
  prefs: import("@/lib/themes").LookPrefs;
  share: import("@/app/actions").ShareSettings;
  created_at: string;
  is_admin: boolean;
}

export const getMyProfile = cache(async (): Promise<MyProfile | null> => {
  if (!supabaseEnabled) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, name, avatar_url, avatar_emoji, avatar_color, bio, program, study_year, weekly_goal_minutes, prefs, share, created_at, is_admin")
    .maybeSingle();
  return (data ?? null) as MyProfile | null;
});

/** Cheers I sent and received (counts), for badges. */
export async function getCheerCounts(): Promise<{ sent: number; received: number }> {
  if (!supabaseEnabled) return { sent: 0, received: 0 };
  const me = await getUserId();
  const supabase = await createClient();
  const [{ count: sent }, { count: received }] = await Promise.all([
    supabase.from("reactions").select("id", { count: "exact", head: true }).eq("from_user", me ?? ""),
    supabase.from("reactions").select("id", { count: "exact", head: true }).eq("to_user", me ?? ""),
  ]);
  return { sent: sent ?? 0, received: received ?? 0 };
}
