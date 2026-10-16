import webpush from "web-push";
import { anonClient } from "@/lib/privateFeed";

export interface PushItem {
  key: string; // dedupe key: each key is sent at most once
  title: string;
  body: string;
  url: string;
}

/** Sends each item once to all of the user's devices. Returns how many notifications went out. */
export async function sendPush(
  token: string,
  subscriptions: { endpoint: string; p256dh: string; auth: string }[],
  items: PushItem[],
): Promise<number> {
  if (!items.length || !subscriptions.length) return 0;
  const sb = anonClient();
  const [{ data: pub }, { data: priv }] = await Promise.all([
    sb.rpc("vapid_public"),
    sb.rpc("vapid_private", { p_token: token }),
  ]);
  if (!pub || !priv) return 0;
  webpush.setVapidDetails("https://unihub-beta.vercel.app", pub as string, priv as string);

  let sent = 0;
  for (const n of items) {
    const { data: fresh } = await sb.rpc("push_mark", { p_token: token, p_key: n.key });
    if (!fresh) continue; // already sent
    for (const s of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.key }),
          { TTL: 3600 },
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.rpc("push_mark", { p_token: token, p_key: "", p_dead_endpoint: s.endpoint });
      }
    }
  }
  return sent;
}
