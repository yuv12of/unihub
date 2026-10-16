import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { connection } from "next/server";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

async function currentUser() {
  await connection();
  if (!supabaseEnabled) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.email) return null;
  const meta = (claims.user_metadata ?? {}) as { full_name?: string; name?: string };
  return { email: claims.email as string, name: meta.full_name ?? meta.name ?? null };
}

/** Sidebar footer on PC: name, email, sign out. */
export async function UserPanel() {
  const user = await currentUser();
  if (!user) return null;
  return (
    <form action="/auth/signout" method="post" className="border-t border-rule pt-4 text-sm">
      {user.name && <div className="font-medium truncate">{user.name}</div>}
      <div className="text-ink-soft truncate" dir="ltr">
        {user.email}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button className="text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">יציאה</button>
        <ThemeToggle />
      </div>
    </form>
  );
}

/** Compact avatar + sign-out in the phone header. */
export async function UserBadge() {
  const user = await currentUser();
  if (!user) return null;
  const initial = (user.name ?? user.email).trim().charAt(0).toUpperCase();
  return (
    <form action="/auth/signout" method="post" className="flex items-center gap-3 text-sm">
      <ThemeToggle compact />
      <button className="text-ink-soft">יציאה</button>
      <Link href="/settings" className="text-ink-soft" aria-label="הגדרות">
        הגדרות
      </Link>
      <span
        className="grid size-8 place-items-center rounded-full bg-ink text-bg text-sm font-semibold"
        aria-label={user.email}
        title={user.email}
      >
        {initial}
      </span>
    </form>
  );
}
