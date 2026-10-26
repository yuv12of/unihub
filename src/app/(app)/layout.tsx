import { Suspense } from "react";
import Link from "next/link";
import { SideNav, TabBar } from "@/components/Nav";
import { getBadges, getCourses, getMyProfile, hasSpotify } from "@/lib/userdata";
import { MusicBar } from "@/components/SpotifyPlayer";
import { QuickLog } from "@/components/QuickLog";
import { supabaseEnabled } from "@/lib/supabase/config";
import { connection } from "next/server";
import { UserBadge, UserPanel } from "@/components/UserBadge";
import { LiveClock } from "@/components/LiveClock";
import { ScrollReset } from "@/components/ScrollReset";
import { SwRegister } from "@/components/SwRegister";
import { semester, themeOf } from "@/lib/semester";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    // Phone: a fixed-height shell. Only the middle part scrolls, and the tab bar is a normal
    // element at the bottom (not position:fixed), so iOS can't drag it along when the page scrolls.
    <div className="flex h-dvh flex-col md:flex-row lg:h-auto lg:min-h-dvh">
      {/* PC: sidebar on the start (right) side. iPad portrait (md): the same items as an icon rail. */}
      <aside className="app-sidebar hidden overflow-y-auto [scrollbar-width:none] md:sticky md:top-0 md:flex md:h-dvh md:w-[4.5rem] md:shrink-0 md:flex-col md:border-e md:border-rule md:bg-surface md:px-2 md:py-5 lg:w-60 lg:px-5 lg:py-7">
        <Link href="/" className="text-center font-display text-2xl lg:text-start" aria-label="Unihub">
          <span className="lg:hidden" aria-hidden>U</span>
          <span className="hidden lg:inline">Unihub</span>
        </Link>
        <p className="mt-1 hidden justify-between text-sm text-ink-soft lg:flex">
          <span>סמסטר {semester.semester}</span>
          <LiveClock />
        </p>
        <Suspense fallback={<div className="mt-8 h-96" />}>
          <SideNavWithBadges />
        </Suspense>
        <div className="mt-auto hidden lg:block">
          <Suspense fallback={null}>
            <UserPanel />
          </Suspense>
        </div>
      </aside>

      <div id="scroller" className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain lg:overflow-visible">
        <Suspense fallback={null}>
          <ScrollReset />
        </Suspense>
        <SwRegister />
        <Suspense fallback={null}>
          <QuickLogMount />
        </Suspense>
        {/* Phone: slim header */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-bg/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
          <Link href="/" className="font-display text-xl">
            Unihub
          </Link>
          <Suspense fallback={null}>
            <UserBadge />
          </Suspense>
        </header>

        {/* A page that marks itself data-wide (the book reader) gets the whole width on a computer. */}
        <main className="mx-auto max-w-6xl px-4 pb-8 pt-6 sm:px-6 md:pb-[calc(4rem+var(--player-h,0px))] lg:px-12 lg:pt-10 lg:has-[[data-wide]]:max-w-none lg:has-[[data-wide]]:px-8 lg:has-[[data-wide]]:pt-0">{children}</main>
      </div>

      <Suspense fallback={null}>
        <MusicBarMount />
      </Suspense>

      <Suspense fallback={<div className="h-[calc(env(safe-area-inset-bottom)+4.6rem)] shrink-0 border-t border-rule bg-surface md:hidden" />}>
        <TabBarWithBadges />
      </Suspense>
    </div>
  );
}

async function SideNavWithBadges() {
  await connection();
  return <SideNav badges={await getBadges()} />;
}

async function MusicBarMount() {
  await connection();
  return (await hasSpotify()) ? <MusicBar /> : null;
}

async function QuickLogMount() {
  await connection();
  if (!supabaseEnabled || !(await getMyProfile())) return null;
  const courses = await getCourses();
  return <QuickLog courses={courses.map((c) => ({ code: c.code, short: themeOf(courses, c.code).short, color: themeOf(courses, c.code).color }))} />;
}

async function TabBarWithBadges() {
  await connection();
  const [badges, me] = await Promise.all([getBadges(), getMyProfile()]);
  return <TabBar badges={badges} tabs={me?.prefs?.tabs} />;
}
