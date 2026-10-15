"use client";

import { useOptimistic, useTransition } from "react";
import { setSessionStatus } from "@/app/actions";

export function SessionToggle({ sessionKey, status }: { sessionKey: string; status?: "done" | "skipped" }) {
  const [current, set] = useOptimistic(status ?? null, (_s, next: "done" | "skipped" | null) => next);
  const [, start] = useTransition();
  const save = (next: "done" | "skipped" | null) =>
    start(async () => {
      set(next);
      await setSessionStatus(sessionKey, next);
    });

  if (current)
    return (
      <button
        type="button"
        onClick={() => save(null)}
        className="shrink-0 rounded-full border border-rule px-3 py-1.5 text-sm text-ink-soft hover:border-ink"
        aria-label="ביטול סימון"
      >
        {current === "done" ? "✓ בוצע" : "דולג"}
      </button>
    );
  return (
    <span className="flex shrink-0 gap-1.5">
      <button
        type="button"
        onClick={() => save("done")}
        className="rounded-full border border-rule px-3 py-1.5 text-sm hover:border-ink"
      >
        בוצע
      </button>
      <button
        type="button"
        onClick={() => save("skipped")}
        className="hidden rounded-full px-2 py-1.5 text-sm text-ink-soft hover:text-ink sm:inline"
      >
        דילוג
      </button>
    </span>
  );
}
