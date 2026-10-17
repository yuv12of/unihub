import { connection } from "next/server";
import { bearer, buildFromFeed, israelNow, loadPrivate, restForFeed, type PrivateFeed } from "@/lib/privateFeed";
import { deliverNotifications, sendPush, sendPushAsServer } from "@/lib/push";
import { remindersFor } from "@/lib/reminders";
import { syncDueGoogle } from "@/lib/googleCal";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Called every 10 minutes by any user's Apps Script.
 * - Reminders for that user (sessions, tutorials, routines, tomorrow's deadlines, evening wrap-up).
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
  if (data.feed.subscriptions.length) sent += await sendPush(token, data.feed.subscriptions, remindersFor(data, now));

  const admin = adminClient();
  let others = 0;
  let google = 0;
  if (admin) {
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
      others += await sendPushAsServer(userId, list, remindersFor(built, now));
    }
    sent += others + (await deliverNotifications());
    google = await syncDueGoogle(admin);
  }
  return Response.json({ sent, others, google });
}
