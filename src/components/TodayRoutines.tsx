"use client";
import { range } from "@/lib/time";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toggleRoutine } from "@/app/act";
import { CATEGORY, type Occurrence } from "@/lib/routines";

/** Today's routines with a tick each. */
export function TodayRoutines({ items, date }: { items: Occurrence[]; date: string }) {
  const [, start] = useTransition();
  const [list, setDone] = useOptimistic(items, (s, { id, on }: { id: string; on: boolean }) =>
    s.map((o) => (o.routineId === id ? { ...o, done: on } : o)),
  );
  const left = list.filter((o) => !o.done).length;
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="section-title">השגרה של היום</h2>
        <Link href="/routines" className="text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">
          {left ? `נשארו ${left}` : "הכל בוצע"}
        </Link>
      </div>
      <ul className="panel divide-y divide-rule overflow-hidden">
        {list.map((o) => (
          <li key={o.routineId} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
            <button
              type="button"
              onClick={() =>
                start(async () => {
                  setDone({ id: o.routineId, on: !o.done });
                  await toggleRoutine(o.routineId, date, !o.done);
                })
              }
              aria-pressed={o.done}
              aria-label={o.done ? `בטל סימון: ${o.title}` : `סמן כבוצע: ${o.title}`}
              className="grid size-7 shrink-0 place-items-center rounded-full border-2 text-xs text-white"
              style={{ borderColor: CATEGORY[o.category].color, background: o.done ? CATEGORY[o.category].color : "transparent" }}
            >
              {o.done ? "✓" : ""}
            </button>
            <bdi dir="ltr" className="w-[5.5rem] shrink-0 text-end text-sm tabular-nums text-ink-soft">
              {o.start ? range(o.start, o.end) : "בלי שעה"}
            </bdi>
            <span className={`min-w-0 flex-1 truncate ${o.done ? "text-ink-soft line-through" : ""}`}>
              {o.emoji} {o.title}
            </span>
            {o.flexible && o.start && <span className="shrink-0 text-[11px] text-ink-soft">שובץ</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
