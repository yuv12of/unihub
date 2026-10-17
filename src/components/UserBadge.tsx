import Link from "next/link";
import { connection } from "next/server";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar } from "@/components/Avatar";
import { LookSync } from "@/components/ProfileParts";
import { getMyProfile } from "@/lib/userdata";

async function currentUser() {
  await connection();
  return getMyProfile();
}

/** Sidebar footer on PC: picture + name (to the profile), sign out, theme. Also applies the saved look. */
export async function UserPanel() {
  const me = await currentUser();
  if (!me) return null;
  const name = me.name ?? me.email.split("@")[0];
  return (
    <>
    <form action="/auth/signout" method="post" className="border-t border-rule pt-4 text-sm">
      <LookSync prefs={me.prefs ?? {}} />
      <Link href="/profile" className="flex items-center gap-2.5 rounded-lg p-1 hover:bg-rule/50">
        <Avatar name={name} url={me.avatar_url} emoji={me.avatar_emoji} color={me.avatar_color} size={34} />
        <span className="min-w-0">
          <span className="block truncate font-medium">{name}</span>
          <span className="block truncate text-xs text-ink-soft">הפרופיל שלי</span>
        </span>
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <button className="text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">יציאה</button>
        <ThemeToggle />
      </div>
    </form>
    </>
  );
}

/** Phone header: theme, settings, and the picture (to the profile). */
export async function UserBadge() {
  const me = await currentUser();
  if (!me) return null;
  const name = me.name ?? me.email.split("@")[0];
  return (
    <div className="flex items-center gap-3 text-sm">
      <LookSync prefs={me.prefs ?? {}} />
      <ThemeToggle compact />
      <Link href="/settings" className="text-ink-soft" aria-label="הגדרות">
        הגדרות
      </Link>
      <Link href="/profile" aria-label="הפרופיל שלי">
        <Avatar name={name} url={me.avatar_url} emoji={me.avatar_emoji} color={me.avatar_color} size={32} />
      </Link>
    </div>
  );
}
