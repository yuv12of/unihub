import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseEnabled } from "@/lib/supabase/config";
import { AccountActions } from "@/components/AccountActions";
import { Avatar } from "@/components/Avatar";

export default function AdminPage() {
  return (
    <>
      <h1 className="font-display text-4xl">חשבונות</h1>
      <p className="mt-2 text-ink-soft">מי שמתחבר בפעם הראשונה מחכה כאן לאישור שלך.</p>
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Accounts />
      </Suspense>
    </>
  );
}

interface Account {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  status: "pending" | "approved" | "blocked";
  is_admin: boolean;
  created_at: string;
  courses: number;
}

const statusLabel = { pending: "ממתין", approved: "מאושר", blocked: "חסום" };

async function Accounts() {
  await connection();
  if (!supabaseEnabled) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_users");
  if (error) notFound();
  const accounts = (data ?? []) as Account[];
  const when = (iso: string) =>
    new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", year: "2-digit" }).format(new Date(iso));

  return (
    <ul className="panel mt-8 max-w-3xl divide-y divide-rule overflow-hidden">
      {accounts.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-4 px-4 py-3 sm:px-5">
          <Avatar name={a.name ?? a.email} url={a.avatar_url} />
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              {a.name ?? a.email.split("@")[0]}
              {a.is_admin && <span className="ms-2 text-xs text-ink-soft">(את/ה)</span>}
            </div>
            <div className="truncate text-sm text-ink-soft" dir="ltr">
              {a.email}
            </div>
            <div className="text-xs text-ink-soft">
              נרשם ב־{when(a.created_at)} · {a.courses} קורסים ·{" "}
              <span className={a.status === "pending" ? "hl" : undefined}>{statusLabel[a.status]}</span>
            </div>
          </div>
          {!a.is_admin && <AccountActions id={a.id} status={a.status} />}
        </li>
      ))}
    </ul>
  );
}
