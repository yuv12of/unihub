"use client";

import { useState, useTransition } from "react";
import { setDayOff } from "@/app/actions";

const REASONS = [
  ["sick", "🤒 חולה"],
  ["reserve", "🪖 מילואים"],
  ["family", "👨‍👩‍👧 משפחה"],
  ["other", "😮‍💨 סתם יום קשה"],
] as const;

/** "Rough day": today's study moves to the next days and streaks are kept. */
export function DayOff({ date, isOff }: { date: string; isOff: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (isOff)
    return (
      <div className="panel flex flex-wrap items-center gap-3 p-4">
        <span className="text-2xl" aria-hidden>
          🛋️
        </span>
        <p className="min-w-0 flex-1 text-sm">
          <b>היום יום מנוחה.</b> הלימוד עבר לימים הבאים, והרצפים בשגרה נשמרים. תרגיש/י טוב.
        </p>
        <button disabled={pending} onClick={() => start(() => setDayOff(date, null))} className="text-sm text-ink-soft underline underline-offset-4 decoration-rule">
          ביטול
        </button>
      </div>
    );
  return (
    <div>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">
          יום קשה היום?
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {REASONS.map(([r, label]) => (
            <button
              key={r}
              type="button"
              disabled={pending}
              onClick={() => start(() => setDayOff(date, r))}
              className="rounded-full border border-rule bg-surface px-3 py-1.5 text-sm hover:border-ink"
            >
              {label}
            </button>
          ))}
          <button type="button" onClick={() => setOpen(false)} className="px-2 text-sm text-ink-soft">
            ביטול
          </button>
        </div>
      )}
    </div>
  );
}
