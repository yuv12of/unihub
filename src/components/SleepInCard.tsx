"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { setSleepIn } from "@/app/act";
import { Icon } from "@/components/Icon";
import type { SleepIn } from "@/lib/sleepIn";

/** Tonight earned an extra hour: offer it, or show that tomorrow starts later. */
export function SleepInCard({ s }: { s: SleepIn }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const key = `sleepin:no:${s.date}`;
  const [dismissed, setDismissed] = useState(false);
  // Read after hydration (server and first client render agree on "not dismissed").
  const stored = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const hidden = dismissed || stored;
  if (hidden && !s.accepted) return null;

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message || "השמירה נכשלה");
      }
    });

  if (s.accepted)
    return (
      <div className="panel flex flex-wrap items-center gap-3 p-4 text-sm">
        <span className="grid size-10 place-items-center rounded-full bg-bg text-ink-soft">
          <Icon name="moon" className="size-5" />
        </span>
        <p className="min-w-0 flex-1">
          <b>מחר ישנים עד <bdi dir="ltr">{s.until}</bdi>.</b> ההשכמה וארוחת הבוקר זזו, והלימוד מתחיל אחריהן.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setSleepIn(s.date, null, null))}
          className="text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink"
        >
          ביטול
        </button>
      </div>
    );

  return (
    <div className={`panel p-4 ${pending ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-bg text-ink-soft">
          <Icon name="moon" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">מחר אפשר לישון שעה יותר</p>
          <p className="text-sm text-ink-soft">{s.reason}. ההשכמה תזוז ל־<bdi dir="ltr">{s.until}</bdi>, והלימוד יתחיל אחריה.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => setSleepIn(s.date, s.from, s.until))}
              className="rounded-lg bg-ink px-4 py-2 font-medium text-bg"
            >
              לישון עד <bdi dir="ltr">{s.until}</bdi>
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.setItem(`sleepin:no:${s.date}`, "1");
                } catch {}
                setDismissed(true);
              }}
              className="text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink"
            >
              לא צריך
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm">
              <span className="hl">{error}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
