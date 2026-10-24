import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getCheerCounts, getMyProfile, getMyStudyDays, getPeople, getUserPlan } from "@/lib/userdata";
import { computeBadges } from "@/lib/badges";
import { standing } from "@/lib/progress";
import { weekStart } from "@/lib/routines";
import { duration } from "@/lib/time";
import { todayInIsrael } from "@/lib/semester";
import { Avatar } from "@/components/Avatar";
import { BadgeGrid } from "@/components/BadgeGrid";
import { Heatmap } from "@/components/Heatmap";
import { ProfileEditor } from "@/components/ProfileParts";
import { Tabs } from "@/components/Fold";
import { supabaseEnabled } from "@/lib/supabase/config";
import type { MyProfile } from "@/lib/userdata";

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
      <Profile />
    </Suspense>
  );
}

async function Profile() {
  await connection();
  const today = todayInIsrael();
  const [mine, plan, days, people, cheers] = await Promise.all([getMyProfile(), getUserPlan(today), getMyStudyDays(), getPeople(), getCheerCounts()]);
  // Local design previews (no database) show a sample person.
  const me = mine ?? (!supabaseEnabled && process.env.UNIHUB_DEMO ? DEMO_ME : null);
  if (!me) return <p>הפרופיל זמין אחרי התחברות.</p>;
  const friends = people.filter((p) => p.i_follow === "accepted" || p.follows_me === "accepted").length;
  const badges = computeBadges({
    today,
    studyDays: days,
    weeklyGoal: me.weekly_goal_minutes,
    courses: plan.courses,
    progress: plan.progress,
    routines: plan.routines,
    logs: plan.logs,
    offDays: plan.offDays,
    friends,
    cheersSent: cheers.sent,
    cheersReceived: cheers.received,
  });
  const total = Object.values(days).reduce((n, m) => n + m, 0);
  const ws = weekStart(today);
  const week = Object.entries(days).filter(([d]) => d >= ws && d <= today).reduce((n, [, m]) => n + m, 0);
  const goal = me.weekly_goal_minutes ?? 0;
  const submitted = plan.courses.reduce((n, c) => n + standing(c, plan.progress, today).submittedCount, 0);
  const name = me.name ?? me.email.split("@")[0];
  const since = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(new Date(me.created_at));

  const tile = (label: string, value: string, sub?: string) => (
    <div className="panel p-4">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className="mt-1 font-display text-2xl tabular-nums">{value}</div>
      {sub && <div className="text-xs text-ink-soft">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start gap-5">
        <Avatar name={name} url={me.avatar_url} emoji={me.avatar_emoji} color={me.avatar_color} size={84} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-4xl">{name}</h1>
          <p className="text-ink-soft">
            {[me.program, me.study_year].filter(Boolean).join(" · ") || "האוניברסיטה הפתוחה"} · ב־Unihub מ{since}
          </p>
          {me.bio && <p className="mt-2 max-w-xl leading-relaxed">{me.bio}</p>}
          <div className="mt-3">
            <ProfileEditor
              photo={me.avatar_url}
              initial={{
                name,
                bio: me.bio ?? "",
                program: me.program ?? "",
                study_year: me.study_year ?? "",
                avatar_emoji: me.avatar_emoji ?? "",
                avatar_color: me.avatar_color ?? "",
                weekly_goal_minutes: me.weekly_goal_minutes,
              }}
            />
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tile("השבוע", duration(week), goal ? `מתוך יעד של ${duration(goal)}` : "בלי יעד שבועי")}
        {tile("סך הכל", `${Math.round(total / 60)} ש׳`, "לימוד שסומן")}
        {tile("מטלות שהוגשו", String(submitted))}
        {tile("חברים", String(friends), cheers.received ? `${cheers.received} פרגונים התקבלו` : undefined)}
      </section>
      <div className="-mt-4 flex items-center gap-3">
        {goal > 0 && (
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-rule" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={week} aria-label="התקדמות ליעד השבועי">
            <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${Math.min(100, (week / goal) * 100)}%` }} />
          </div>
        )}
        {/* the goal is set in one place: Settings → study times */}
        <Link href="/settings#study" className="btn-ghost text-xs">
          {goal ? "שינוי היעד" : "קביעת יעד שבועי"}
        </Link>
      </div>

      <Tabs
        id="profile"
        tabs={[
          {
            key: "badges",
            label: `תגים (${badges.filter((b) => b.earned).length}/${badges.length})`,
            panel: <BadgeGrid badges={badges} />,
          },
          {
            key: "days",
            label: "ימי לימוד",
            panel: (
              <section className="panel overflow-x-auto p-5">
                <Heatmap days={days} today={today} weeks={20} />
              </section>
            ),
          },
        ]}
      />

      <form action="/auth/signout" method="post">
        <button className="btn text-ink-soft">יציאה מהחשבון</button>
      </form>

      <p className="text-sm text-ink-soft">
        מה החברים רואים קובעים ב
        <Link href="/friends" className="underline underline-offset-4 decoration-rule hover:text-ink">
          עמוד החברים
        </Link>
        . מראה, מוזיקה, זמני לימוד והתראות ב
        <Link href="/settings" className="underline underline-offset-4 decoration-rule hover:text-ink">
          הגדרות
        </Link>
        .
      </p>
    </div>
  );
}

const DEMO_ME: MyProfile = {
  id: "demo",
  email: "demo@example.com",
  name: "סטודנט/ית לדוגמה",
  avatar_url: null,
  avatar_emoji: "🦉",
  avatar_color: "blue",
  bio: null,
  program: "מדעי המחשב",
  study_year: "שנה א׳",
  weekly_goal_minutes: 12 * 60,
  prefs: {},
  share: {} as MyProfile["share"],
  created_at: "2026-09-01T00:00:00Z",
  is_admin: false,
};
