import { connection } from "next/server";
import { anonClient, bearer, buildFromFeed, israelNow, loadPrivate, restForFeed, type PrivateFeed } from "@/lib/privateFeed";
import { deliverNotifications, sendPush, sendPushAsServer } from "@/lib/push";
import { remindersFor, type ReminderExtras } from "@/lib/reminders";
import type { IfThenPlan } from "@/lib/ifthen";
import { syncDueGoogle } from "@/lib/googleCal";
import { adminClient } from "@/lib/supabase/admin";
import { backfillAttachmentText } from "@/lib/pdfText";
import { scanExamMails } from "@/lib/examScan";
import { cleanPlan } from "@/lib/degree";
import { registrationPushes } from "@/lib/registration";
import type { SheiltaSnapshot } from "@/lib/sheilta";
import { paceWarnings, paceWindow, type PacePoint } from "@/lib/pace";
import { progressKey } from "@/lib/progress";
import { CURRENT_SEMESTER, semester, typeLabel } from "@/lib/semester";
import { isStudyPush, modulesOf } from "@/lib/modules";
import { goalPushes } from "@/lib/goalMeta";
import { loadGoals } from "@/lib/goals";

/**
 * Called every 10 minutes by any user's Apps Script.
 * - Reminders for that user (sessions, tutorials, routines, tomorrow's deadlines, the ~21:30 evening
 *   push, and the user's own if-then plans when their trigger fires).
 * - With the server key set: the same reminders for everyone else who turned on phone notifications
 *   (so friends get them without their own script), and pending notifications (follow requests,
 *   invites, cheers…). Every reminder is sent at most once, however many scripts call this.
 */
export async function POST(req: Request) {
  await connection();
  const token = bearer(req);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  const data = await loadPrivate(token);
  if (!data) return Response.json({ error: "unauthorized" }, { status: 401 });
  const now = israelNow();

  let sent = 0;
  const admin0 = adminClient();
  if (data.feed.subscriptions.length) {
    const { data: degree } = await anonClient().rpc("degree_feed", { p_token: token });
    const me = admin0 ? await userOfToken(admin0, token) : null;
    // Student mode off: no study, deadline, degree or pace pushes (routines, events and the rest stay).
    const study = admin0 && me ? (await studyOn(admin0, [me])).has(me) : true;
    const pace = study && admin0 && me ? await pacePushes(admin0, me, data, now) : [];
    const goals = admin0 && me ? await goalPushesFor(admin0, me, now, data.offDays) : [];
    const base = [...remindersFor(data, now, await extrasByToken(token)), ...goals];
    sent += await sendPush(token, data.feed.subscriptions, study ? [...base, ...degreePushes(degree, now, data.offDays), ...pace] : base.filter((p) => !isStudyPush(p.key)));
  }

  const admin = adminClient();
  let others = 0;
  let google = 0;
  let pdfs = 0;
  let exams = 0;
  // Everyone else's reminders run at most once every 8 minutes, however many scripts call this.
  const turn = admin
    ? (await admin.rpc("claim_tick")).data === true
    : false;
  if (admin && turn) {
    const { data: subs } = await admin.from("push_subscriptions").select("user_id, endpoint, p256dh, auth");
    const byUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
    for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
    const mine = new Set(data.feed.subscriptions.map((s) => s.endpoint));
    const students = await studyOn(admin, [...byUser.keys()]);
    for (const [userId, list] of byUser) {
      if (list.some((s) => mine.has(s.endpoint))) continue; // that's the caller, done above
      const { data: feed } = await admin.rpc("_feed_for", { uid: userId });
      if (!feed) continue;
      const full = { ...(feed as PrivateFeed), subscriptions: list, mails: [], cards_due: 0 };
      const built = buildFromFeed(full, await restForFeed(full));
      const goals = await goalPushesFor(admin, userId, now, built.offDays);
      if (!students.has(userId)) {
        others += await sendPushAsServer(userId, list, [...remindersFor(built, now, await extrasByUser(admin, userId)).filter((p) => !isStudyPush(p.key)), ...goals]);
        continue;
      }
      const { data: degree } = await admin.from("degree_plans").select("plan, sheilta").eq("user_id", userId).maybeSingle();
      others += await sendPushAsServer(userId, list, [
        ...remindersFor(built, now, await extrasByUser(admin, userId)),
        ...degreePushes(degree, now, built.offDays),
        ...(await pacePushes(admin, userId, built, now)),
        ...goals,
      ]);
    }
    pdfs = await backfillAttachmentText(admin).catch(() => 0);
    // Exam dates in new mail (after PDF text, the Sheilta notice is a PDF); Saturday night a wider safety scan.
    const weekly = new Date(now.date + "T00:00:00Z").getUTCDay() === 6 && now.minutes >= 21 * 60 && now.minutes < 21 * 60 + 15;
    exams = await scanExamMails(admin, weekly ? 120 : 3).catch(() => 0);
    sent += others + (await deliverNotifications());
    google = await syncDueGoogle(admin);
  }
  return Response.json({ sent, others, google, pdfs, exams });
}

/** Goal reminders for a user who turned the goals module on; none on a rough day, none if anything fails. */
async function goalPushesFor(admin: NonNullable<ReturnType<typeof adminClient>>, userId: string, now: { date: string; minutes: number }, offDays: string[]) {
  if (offDays.includes(now.date) || now.minutes < 10 * 60) return [];
  try {
    const { data: p } = await admin.from("profiles").select("prefs").eq("id", userId).maybeSingle();
    if (!modulesOf(p?.prefs as { modules?: Record<string, unknown> } | null).goals) return [];
    return goalPushes(await loadGoals(admin, userId), now);
  } catch {
    return [];
  }
}

/** Which of these users have student mode on. If the lookup fails, everyone counts as a student (nothing is silenced by mistake). */
async function studyOn(admin: NonNullable<ReturnType<typeof adminClient>>, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data, error } = await admin.from("profiles").select("id, prefs").in("id", ids);
  if (error || !data) return new Set(ids);
  const off = new Set(data.filter((p) => !modulesOf(p.prefs as { modules?: Record<string, unknown> } | null).study).map((p) => p.id as string));
  return new Set(ids.filter((id) => !off.has(id)));
}

async function userOfToken(admin: NonNullable<ReturnType<typeof adminClient>>, token: string): Promise<string | null> {
  const { data } = await admin.from("ingest_tokens").select("user_id").eq("token", token).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

/**
 * The evening "behind on this assignment" push (src/lib/pace.ts): open file assignments with five
 * days or fewer left that I track in the ready-to-submit check, judged by their latest point.
 */
async function pacePushes(admin: NonNullable<ReturnType<typeof adminClient>>, userId: string, built: ReturnType<typeof buildFromFeed>, now: { date: string; minutes: number }) {
  if (now.minutes < 17 * 60 || built.offDays.includes(now.date)) return [];
  const open = built.courses.flatMap((c) =>
    c.assignments
      .filter((a) => a.type === "file" && a.due >= now.date && !["submitted", "skipped"].includes(built.progress[progressKey(c.code, a.n)]?.status ?? ""))
      .map((a) => ({ c, a })),
  );
  if (!open.length) return [];
  const { data } = await admin.from("assignment_pace").select("course_code, n, at, answered, total").match({ user_id: userId, semester: semester.semester }).order("at");
  const last = new Map<string, PacePoint>();
  for (const r of data ?? []) last.set(`${r.course_code}|${r.n}`, { at: r.at as string, answered: r.answered as number, total: r.total as number });
  return paceWarnings(
    open.flatMap(({ c, a }) => {
      const window = paceWindow(c.assignments, a.n, CURRENT_SEMESTER.starts);
      return window
        ? [{ code: c.code, courseName: c.short, n: a.n, label: `${typeLabel[a.type]} ${a.n}`, due: a.due, window, last: last.get(`${c.code}|${a.n}`) ?? null }]
        : [];
    }),
    now,
  );
}

/** Registration reminders from the degree plan (src/lib/registration.ts). On a rough day only the last-day ones. */
function degreePushes(row: unknown, now: { date: string; minutes: number }, offDays: string[]) {
  const r = row as { plan?: unknown; sheilta?: SheiltaSnapshot | null } | null;
  if (!r?.plan) return [];
  const items = registrationPushes(cleanPlan(r.plan), r.sheilta ?? null, now);
  return offDays.includes(now.date) ? items.filter((i) => /\|(last|late)$/.test(i.key)) : items;
}

type Row = { id: string; kind?: string; trigger_kind?: string; params: IfThenPlan["params"] | null; action: string; active: boolean };
const toPlans = (rows: Row[] | null | undefined): IfThenPlan[] =>
  (rows ?? []).map((r) => ({ id: r.id, kind: (r.kind ?? r.trigger_kind) as IfThenPlan["kind"], params: r.params ?? {}, action: r.action, active: r.active }));

/** If-then plans and a running timer for the caller (RPC from 0022; empty until it's applied). */
async function extrasByToken(token: string): Promise<ReminderExtras> {
  const { data, error } = await anonClient().rpc("automation_feed", { p_token: token });
  if (error || !data) return {};
  const d = data as { if_then?: Row[]; live_started_at?: string | null };
  return { ifThen: toPlans(d.if_then), liveStartedAt: d.live_started_at ?? null };
}

async function extrasByUser(admin: NonNullable<ReturnType<typeof adminClient>>, userId: string): Promise<ReminderExtras> {
  const [plans, live] = await Promise.all([
    admin.from("if_then").select("id, trigger_kind, params, action, active").eq("user_id", userId).eq("active", true),
    admin.from("study_live").select("started_at").eq("user_id", userId).gt("ends_at", new Date().toISOString()).maybeSingle(),
  ]);
  return { ifThen: plans.error ? [] : toPlans(plans.data as Row[]), liveStartedAt: live.data?.started_at ?? null };
}
