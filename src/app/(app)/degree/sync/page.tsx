import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { SheiltaSync } from "@/components/SheiltaSync";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { SheiltaSnapshot } from "@/lib/sheilta";

/** Sheilta → Unihub: the bookmark that reads courses and grades, and where its data lands. */
export default function SyncPage() {
  return (
    <>
      <p className="text-sm">
        <Link href="/degree" className="text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
          תכנית התואר
        </Link>
      </p>
      <h1 className="mt-1 font-display text-4xl">סנכרון משאילתא</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        הקורסים, מצב ההרשמה והציונים שלך מגיעים מהשאילתא בלחיצה אחת על סימנייה, כשאת/ה מחובר/ת לשאילתא. הסיסמה לא עוברת ל־Unihub ולא נשמרת בו.
      </p>
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Sync />
      </Suspense>
    </>
  );
}

async function Sync() {
  await connection();
  let last: { syncedAt: string; count: number } | null = null;
  if (supabaseEnabled) {
    const sb = await createClient();
    const { data } = await sb.from("degree_plans").select("sheilta").maybeSingle();
    const s = data?.sheilta as SheiltaSnapshot | null;
    if (s?.syncedAt) last = { syncedAt: s.syncedAt, count: s.records?.length ?? 0 };
  }
  return <SheiltaSync last={last} editable={supabaseEnabled} />;
}
