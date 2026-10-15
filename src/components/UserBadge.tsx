import { connection } from "next/server";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function UserBadge() {
  await connection();
  if (!supabaseEnabled) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;
  if (!email) return null;
  return (
    <form action="/auth/signout" method="post" className="flex items-center gap-3 text-sm">
      <span className="text-ink-soft truncate max-w-[12rem]" dir="ltr">
        {email}
      </span>
      <button className="underline underline-offset-4 decoration-rule hover:decoration-current">
        יציאה
      </button>
    </form>
  );
}
