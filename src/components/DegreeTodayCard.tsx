import Link from "next/link";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { cleanPlan, nameOf, semIndex, semLabel } from "@/lib/degree";
import { registrationStates } from "@/lib/registration";
import { sittingsFor } from "@/lib/examLoad";
import type { SheiltaSnapshot } from "@/lib/sheilta";
import { DegreeRegistration } from "@/components/DegreeRegistration";

const shift = (iso: string, days: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Today: registration for an upcoming semester while it's open (or opens within two weeks), as long as
 * something is still missing; otherwise, in the weeks grades come out, a nudge to sync from Sheilta.
 * Nothing when neither applies.
 */
export async function DegreeTodayCard({ today, current }: { today: string; current: string }) {
  if (!supabaseEnabled) return null;
  const sb = await createClient();
  const { data } = await sb.from("degree_plans").select("plan, sheilta").maybeSingle();
  if (!data?.plan) return null;
  const plan = cleanPlan(data.plan);
  const snap = (data.sheilta as SheiltaSnapshot | null) ?? null;

  const states = registrationStates(plan, snap, today, 14).filter((s) => !(s.synced && s.missing === 0 && !s.extra.length));
  if (states.length) return <DegreeRegistration states={states} syncedAt={snap?.syncedAt ?? null} compact />;

  // grades: the latest semester (up to now) whose courses have no result yet, from three weeks into its exams
  const waiting = plan.items.filter((i) => i.sem && !i.credited && !i.passed && semIndex(i.sem) <= semIndex(current));
  const sem = waiting.map((i) => i.sem!).sort((a, b) => semIndex(b) - semIndex(a))[0];
  const sit = sem ? sittingsFor(sem) : null;
  if (!sem || !sit?.a.length) return null;
  const from = shift(sit.a[0], 21);
  const until = shift(sit.a[sit.a.length - 1], 60);
  const fresh = snap && snap.syncedAt.slice(0, 10) >= shift(today, -7);
  if (today < from || today > until || fresh) return null;
  const names = waiting.filter((i) => i.sem === sem).map(nameOf);
  return (
    <section className="panel p-4">
      <h2 className="section-title">ציונים של {semLabel(sem)}</h2>
      <p className="mt-1 text-sm">
        הציונים מתפרסמים בשאילתא. סנכרון יסמן מה הושלם ({names.join(", ")}) ויחזיר לשיבוץ מה שלא.
      </p>
      <Link href="/degree/sync" className="btn mt-3 inline-block rounded-lg px-3 text-sm">
        סנכרון משאילתא
      </Link>
    </section>
  );
}
