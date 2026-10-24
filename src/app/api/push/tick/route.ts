import { connection } from "next/server";
import { anonClient, bearer, buildFromFeed, israelNow, loadPrivate, restForFeed, type PrivateFeed } from "@/lib/privateFeed";
import { deliverNotifications, sendPush, sendPushAsServer } from "@/lib/push";
import { remindersFor, type ReminderExtras } from "@/lib/reminders";
import type { IfThenPlan } from "@/lib/ifthen";
import { syncDueGoogle } from "@/lib/googleCal";
import { adminClient } from "@/lib/supabase/admin";
import { backfillAttachmentText } from "@/lib/pdfText";

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
  if (data.feed.subscriptions.length) sent += await sendPush(token, data.feed.subscriptions, remindersFor(data, now, await extrasByToken(token)));

  const admin = adminClient();
  let others = 0;
  let google = 0;
  let pdfs = 0;
  // Everyone else's reminders run at most once every 8 minutes, however many scripts call this.
  const turn = admin
    ? (await admin.rpc("claim_tick")).data === true
    : false;
  if (admin && turn) {
    const { data: subs } = await admin.from("push_subscriptions").select("user_id, endpoint, p256dh, auth");
    const byUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
    for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
    const mine = new Set(data.feed.subscriptions.map((s) => s.endpoint));
    for (const [userId, list] of byUser) {
      if (list.some((s) => mine.has(s.endpoint))) continue; // that's the caller, done above
      const { data: feed } = await admin.rpc("_feed_for", { uid: userId });
      if (!feed) continue;
      const full = { ...(feed as PrivateFeed), subscriptions: list, mails: [], cards_due: 0 };
      const built = buildFromFeed(full, await restForFeed(full));
      others += await sendPushAsServer(userId, list, remindersFor(built, now, await extrasByUser(admin, userId)));
    }
    sent += others + (await deliverNotifications());
    google = await syncDueGoogle(admin);
    pdfs = await backfillAttachmentText(admin).catch(() => 0);
  }
  return Response.json({ sent, others, google, pdfs });
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
