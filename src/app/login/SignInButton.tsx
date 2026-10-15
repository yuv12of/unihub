"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { supabaseEnabled } from "@/lib/supabase/config";

export function SignInButton() {
  const [pending, setPending] = useState(false);

  if (!supabaseEnabled) {
    return (
      <p className="mt-8 text-sm text-ink-soft">
        ההתחברות תופעל אחרי חיבור Supabase (משתני הסביבה עוד לא הוגדרו).
      </p>
    );
  }

  async function signIn() {
    setPending(true);
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <button
      onClick={signIn}
      disabled={pending}
      className="mt-8 rounded-lg bg-ink px-5 py-3 text-bg font-medium disabled:opacity-60"
    >
      {pending ? "מעביר ל־Google…" : "התחברות עם Google"}
    </button>
  );
}
