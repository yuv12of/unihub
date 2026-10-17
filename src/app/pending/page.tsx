import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnabled } from "@/lib/supabase/config";

export default function PendingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="font-display text-5xl">Unihub</h1>
      <Suspense fallback={<div className="mt-6 h-24 animate-pulse rounded-xl bg-rule/60" />}>
        <Status />
      </Suspense>
    </main>
  );
}

async function Status() {
  await connection();
  if (!supabaseEnabled) return null;
  const supabase = await createClient();
  const { data: p } = await supabase.from("profiles").select("name, email, status").maybeSingle();
  const blocked = p?.status === "blocked";
  return (
    <div className="panel mt-6 p-6">
      <h2 className="section-title">{blocked ? "אין גישה לחשבון הזה" : `שלום${p?.name ? ` ${p.name.split(" ")[0]}` : ""}, הבקשה התקבלה`}</h2>
      <p className="mt-2 leading-relaxed text-ink-soft">
        {blocked
          ? "החשבון הזה לא אושר ל־Unihub."
          : "Unihub פתוח לחברים ומשפחה בהזמנה. הבקשה שלך מחכה לאישור, ואחרי האישור הכניסה תיפתח כאן אוטומטית."}
      </p>
      <p className="mt-4 text-sm text-ink-soft" dir="ltr">
        {p?.email}
      </p>
      <div className="mt-5 flex gap-3">
        {!blocked && (
          <a href="/pending" className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg">
            בדיקה שוב
          </a>
        )}
        <form action="/auth/signout" method="post">
          <button className="rounded-lg border border-rule px-4 py-2 text-sm text-ink-soft hover:border-ink">יציאה</button>
        </form>
      </div>
    </div>
  );
}
