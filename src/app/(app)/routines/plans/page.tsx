import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getRoutines } from "@/lib/userdata";
import { IfThenPlans, type IfThenRow } from "@/components/IfThenPlans";
import { Icon } from "@/components/Icon";

export default function IfThenPage() {
  return (
    <>
      <Link href="/routines" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <Icon name="next" className="size-3.5" />
        שגרה
      </Link>
      <h1 className="mt-2 font-display text-4xl">תוכניות אם–אז</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">
        מה עושים כשהתוכנית לא קורית. כשהמצב מתרחש, ההתראה בטלפון מצטטת את מה שכתבת כאן, עם כפתור שמתחיל טיימר קצר. הכי טוב לכתוב אותן בתכנון השבוע במוצאי שבת.
      </p>
      <Suspense fallback={<div className="mt-8 h-72 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Plans />
      </Suspense>
    </>
  );
}

async function Plans() {
  await connection();
  const [plans, routines] = await Promise.all([getPlans(), getRoutines()]);
  return (
    <div className="mt-8 max-w-2xl">
      <IfThenPlans
        plans={plans}
        routines={routines.filter((r) => r.active && r.category !== "sleep" && r.category !== "meal").map((r) => ({ id: r.id, title: r.title }))}
        editable={supabaseEnabled}
      />
    </div>
  );
}

/** My plans (empty until migration 0022 is applied). */
async function getPlans(): Promise<IfThenRow[]> {
  if (!supabaseEnabled) return [];
  const sb = await createClient();
  const { data, error } = await sb.from("if_then").select("id, trigger_kind, params, action, active").order("created_at");
  if (error) return [];
  return (data ?? []).map((r) => ({ id: r.id, kind: r.trigger_kind, params: r.params ?? {}, action: r.action, active: r.active }));
}
