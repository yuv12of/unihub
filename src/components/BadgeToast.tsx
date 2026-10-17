"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/** Celebrates badges earned since the last visit on this device. */
export function BadgeToast({ earned }: { earned: { id: string; emoji: string; title: string }[] }) {
  const [fresh, setFresh] = useState<typeof earned>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("seenBadges");
      const seen = new Set<string>(raw ? JSON.parse(raw) : []);
      const ids = earned.map((b) => b.id);
      // First visit: remember what's already earned without celebrating all of it at once.
      if (raw) setFresh(earned.filter((b) => !seen.has(b.id)));
      localStorage.setItem("seenBadges", JSON.stringify(ids));
    } catch {}
  }, [earned]);
  if (!fresh.length) return null;
  return (
    <div className="panel flex items-center gap-3 border-highlight bg-highlight/25 p-4" role="status">
      <span className="text-3xl" aria-hidden>
        {fresh[0].emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">תג חדש: {fresh.map((b) => b.title).join(", ")}</div>
        <Link href="/profile" className="text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">
          לכל התגים
        </Link>
      </div>
      <button type="button" onClick={() => setFresh([])} className="text-ink-soft" aria-label="סגירה">
        ✕
      </button>
    </div>
  );
}
