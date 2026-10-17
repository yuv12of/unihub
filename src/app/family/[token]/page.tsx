import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { loadFamily } from "@/lib/family";
import { minutesLabel } from "@/lib/planner";
import { relativeDays } from "@/lib/semester";
import { Avatar } from "@/components/Avatar";
import { FamilyCheers } from "@/components/FamilyCheers";

export const metadata: Metadata = { title: "Unihub · משפחה", robots: { index: false, follow: false } };

export default function FamilyPage({ params }: PageProps<"/family/[token]">) {
  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 pb-12 pt-[max(2rem,env(safe-area-inset-top))]" dir="rtl">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-rule/60" aria-hidden />}>
        <Family params={params} />
      </Suspense>
    </main>
  );
}

async function Family({ params }: { params: PageProps<"/family/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  const v = await loadFamily(token);
  if (!v) notFound();
  const tile = (label: string, value: string, note?: string) => (
    <div className="panel p-4">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className="mt-1 font-display text-3xl tabular-nums">{value}</div>
      {note && <div className="mt-0.5 text-xs text-ink-soft">{note}</div>}
    </div>
  );
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <Avatar name={v.name} url={v.avatar_url} emoji={v.avatar_emoji} color={v.avatar_color} size={64} />
        <div>
          <p className="text-sm text-ink-soft">שלום {v.viewer} 👋</p>
          <h1 className="font-display text-3xl">ככה {v.name} מתקדם/ת</h1>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {tile("לימוד השבוע", minutesLabel(v.weekMinutes), v.lastWeekMinutes ? `שבוע שעבר: ${minutesLabel(v.lastWeekMinutes)}` : undefined)}
        {tile("היום", v.todayPlanned ? `${v.todayDone}/${v.todayPlanned}` : "יום חופשי", v.todayPlanned ? "מפגשי לימוד שבוצעו" : undefined)}
      </div>

      {(v.nextExam || v.nextDeadline) && (
        <section className="panel space-y-2 p-4">
          {v.nextExam && (
            <p>
              📝 בחינה ב{v.nextExam.course} <b>{relativeDays(v.nextExam.days)}</b>
            </p>
          )}
          {v.nextDeadline && (
            <p>
              📌 {v.nextDeadline.title} <b>{relativeDays(v.nextDeadline.days)}</b>
            </p>
          )}
        </section>
      )}

      {v.streaks.length > 0 && (
        <section className="panel p-4">
          <h2 className="text-sm font-semibold">רצפים</h2>
          <ul className="mt-2 space-y-1">
            {v.streaks.map((s) => (
              <li key={s.title}>
                {s.emoji} {s.title}: 🔥 {s.count} {s.unit === "days" ? "ימים" : "שבועות"}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel p-4">
        <h2 className="font-semibold">לשלוח עידוד</h2>
        <p className="mt-0.5 text-sm text-ink-soft">{v.name} יקבל/תקבל את זה כהתראה בטלפון.</p>
        <FamilyCheers token={token} />
      </section>

      <p className="text-center text-xs text-ink-soft">דף פרטי לקריאה בלבד מ־Unihub. {v.name} יכול/ה לבטל את הקישור בכל רגע.</p>
    </div>
  );
}
