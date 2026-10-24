"use client";

import { useEffect, useState, useTransition } from "react";
import { setDayOff } from "@/app/act";
import { Icon } from "@/components/Icon";

const REASONS = [
  ["sick", "חולה"],
  ["reserve", "מילואים"],
  ["family", "משפחה"],
  ["other", "סתם יום קשה"],
] as const;

/** "Rough day": today's study moves to the next days and streaks are kept. */
export function DayOff({ date, isOff, sessionsToday = 0, routinesToday = 0 }: { date: string; isOff: boolean; sessionsToday?: number; routinesToday?: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [moved, setMoved] = useState<{ s: number; r: number } | null>(null);
  useEffect(() => {
    try {
      setMoved(JSON.parse(localStorage.getItem(`dayoff:${date}`) ?? "null"));
    } catch {}
  }, [date, isOff]);
  if (isOff)
    return (
      <div className="panel flex flex-wrap items-center gap-3 p-4">
        <span className="grid size-10 place-items-center rounded-full bg-bg text-ink-soft">
          <Icon name="sofa" className="size-5" />
        </span>
        <p className="min-w-0 flex-1 text-sm">
          <b>היום יום מנוחה.</b>{" "}
          {moved?.s ? `הזזתי ${moved.s === 1 ? "מפגש לימוד אחד" : `${moved.s} מפגשי לימוד`} לימים הבאים` : "הלימוד עבר לימים הבאים"}
          {moved?.r ? `, ו־${moved.r === 1 ? "שגרה אחת" : `${moved.r} שגרות`} לא נספרות היום` : ""}. הרצפים נשמרים. תרגיש/י טוב.
        </p>
        <button disabled={pending} onClick={() => start(() => setDayOff(date, null))} className="text-sm text-ink-soft underline underline-offset-4 decoration-rule">
          ביטול
        </button>
      </div>
    );
  return (
    <div>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost">
          <Icon name="sofa" className="size-4" />
          יום קשה היום?
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {REASONS.map(([r, label]) => (
            <button
              key={r}
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  try {
                    localStorage.setItem(`dayoff:${date}`, JSON.stringify({ s: sessionsToday, r: routinesToday }));
                  } catch {}
                  await setDayOff(date, r);
                })
              }
              className="chip"
            >
              {label}
            </button>
          ))}
          <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
            ביטול
          </button>
        </div>
      )}
    </div>
  );
}
