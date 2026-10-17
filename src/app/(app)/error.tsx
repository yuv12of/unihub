"use client";

import Link from "next/link";
import { useEffect } from "react";

/** A friendly card instead of the framework's error screen; "try again" re-renders the page. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div className="panel mx-auto mt-10 max-w-md p-6 text-center">
      <div className="text-4xl" aria-hidden>
        {offline ? "📡" : "😕"}
      </div>
      <h1 className="mt-3 text-xl font-semibold">{offline ? "אין חיבור לאינטרנט" : "משהו השתבש"}</h1>
      <p className="mt-2 text-ink-soft">
        {offline ? "כשהחיבור יחזור, נסו שוב." : "העמוד לא נטען כמו שצריך. אפשר לנסות שוב, ואם זה חוזר, לחזור למסך היום."}
      </p>
      <div className="mt-5 flex justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-lg bg-ink px-5 py-2 font-medium text-bg">
          לנסות שוב
        </button>
        <Link href="/" className="rounded-lg border border-rule px-4 py-2 text-ink-soft hover:border-ink">
          למסך היום
        </Link>
      </div>
      {error.digest && <p className="mt-4 text-xs text-ink-soft">קוד: {error.digest}</p>}
    </div>
  );
}
