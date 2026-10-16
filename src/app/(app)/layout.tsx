import { Suspense } from "react";
import Link from "next/link";
import { SideNav, TabBar } from "@/components/Nav";
import { UserBadge, UserPanel } from "@/components/UserBadge";
import { semester } from "@/lib/semester";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh lg:flex">
      {/* PC: sidebar on the start (right) side */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:border-e lg:border-rule lg:bg-surface lg:px-5 lg:py-7">
        <Link href="/" className="font-display text-2xl">
          Unihub
        </Link>
        <p className="mt-1 text-sm text-ink-soft">סמסטר {semester.semester}</p>
        <SideNav />
        <div className="mt-auto">
          <Suspense fallback={null}>
            <UserPanel />
          </Suspense>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Phone: slim header */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-bg/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
          <Link href="/" className="font-display text-xl">
            Unihub
          </Link>
          <Suspense fallback={null}>
            <UserBadge />
          </Suspense>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-[calc(env(safe-area-inset-bottom)+7.5rem)] pt-6 sm:px-6 lg:px-12 lg:pb-16 lg:pt-10">{children}</main>
      </div>

      <TabBar />
    </div>
  );
}
