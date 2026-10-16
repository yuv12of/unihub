import webpush from "web-push";
import { anonClient } from "@/lib/privateFeed";
import { adminClient } from "@/lib/supabase/admin";

export interface PushItem {
  key: string; // dedupe key: each key is sent at most once per user
  title: string;
  body: string;
  url: string;
}
type Sub = { endpoint: string; p256dh: string; auth: string };

async function sendAll(subs: Sub[], items: PushItem[], fresh: (key: string) => Promise<boolean>, dead: (endpoint: string) => Promise<void>) {
  let sent = 0;
  for (const n of items) {
    if (!(await fresh(n.key))) continue; // already sent
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.key }),
          { TTL: 3600 },
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await dead(s.endpoint);
      }
    }
  }
  return sent;
}

/** Sends each item once to all of one user's devices, authorised by that user's Apps Script token. */
export async function sendPush(token: string, subscriptions: Sub[], items: PushItem[]): Promise<number> {
  if (!items.length || !subscriptions.length) return 0;
  const sb = anonClient();
  const [{ data: pub }, { data: priv }] = await Promise.all([sb.rpc("vapid_public"), sb.rpc("vapid_private", { p_token: token })]);
  if (!pub || !priv) return 0;
  webpush.setVapidDetails("https://unihub-beta.vercel.app", pub as string, priv as string);
  return sendAll(
    subscriptions,
    items,
    async (key) => !!(await sb.rpc("push_mark", { p_token: token, p_key: key })).data,
    async (endpoint) => void (await sb.rpc("push_mark", { p_token: token, p_key: "", p_dead_endpoint: endpoint })),
  );
}

async function adminVapid() {
  const admin = adminClient();
  if (!admin) return null;
  const { data } = await admin.from("app_keys").select("vapid_public, vapid_private").eq("id", 1).maybeSingle();
  if (!data?.vapid_public || !data.vapid_private) return null;
  webpush.setVapidDetails("https://unihub-beta.vercel.app", data.vapid_public, data.vapid_private);
  return admin;
}

/** Server-side sending for any user (needs SUPABASE_SECRET_KEY). */
export async function sendPushAsServer(userId: string, subscriptions: Sub[], items: PushItem[]): Promise<number> {
  if (!items.length || !subscriptions.length) return 0;
  const admin = await adminVapid();
  if (!admin) return 0;
  return sendAll(
    subscriptions,
    items,
    async (key) => {
      const { data } = await admin.from("push_sent").upsert({ user_id: userId, key: key.slice(0, 300) }, { onConflict: "user_id,key", ignoreDuplicates: true }).select("key");
      return (data?.length ?? 0) > 0;
    },
    async (endpoint) => void (await admin.from("push_subscriptions").delete().eq("endpoint", endpoint)),
  );
}

/** Pushes waiting notifications (follow requests, invites, cheers …) to their recipients' phones. */
export async function deliverNotifications(): Promise<number> {
  const admin = await adminVapid();
  if (!admin) return 0;
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data: items } = await admin
    .from("notifications")
    .select("id, user_id, title, body, url")
    .is("sent_at", null)
    .gte("created_at", since)
    .order("created_at")
    .limit(100);
  if (!items?.length) return 0;
  const users = [...new Set(items.map((i) => i.user_id as string))];
  const { data: subs } = await admin.from("push_subscriptions").select("user_id, endpoint, p256dh, auth").in("user_id", users);
  // Mark first, so two deliveries running at once don't double-send.
  await admin.from("notifications").update({ sent_at: new Date().toISOString() }).in("id", items.map((i) => i.id));
  let sent = 0;
  for (const n of items) {
    const mine = (subs ?? []).filter((s) => s.user_id === n.user_id);
    sent += await sendAll(
      mine,
      [{ key: `n|${n.id}`, title: n.title, body: n.body ?? "", url: n.url }],
      async () => true,
      async (endpoint) => void (await admin.from("push_subscriptions").delete().eq("endpoint", endpoint)),
    );
  }
  return sent;
}
