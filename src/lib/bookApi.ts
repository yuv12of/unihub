import { bearer } from "@/lib/privateFeed";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Book import endpoints are called by the import script on the owner's computer with the user's
 * Apps Script token. They need the server key (storage + writes for that user only).
 */
export async function bookCaller(req: Request) {
  const token = bearer(req);
  const admin = adminClient();
  if (!token || !admin) return null;
  const { data } = await admin.from("ingest_tokens").select("user_id").eq("token", token).maybeSingle();
  return data ? { admin, uid: data.user_id as string } : null;
}

/** Keeps every storage path inside the caller's own folder. */
export function ownPath(uid: string, p: unknown) {
  const clean = String(p ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((s) => s && s !== "." && s !== "..")
    .map((s) => s.replace(/[^\w.\-]/g, "_"))
    .join("/");
  if (!clean || !clean.endsWith(".pdf")) return null;
  return `${uid}/${clean.replace(new RegExp(`^${uid}/`), "")}`;
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
