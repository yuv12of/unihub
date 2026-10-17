"use client";

import { useOptimistic, useTransition } from "react";
import { saveProgress } from "@/app/act";

export interface DeadlineRowData {
  key: string;
  code: string;
  n: string;
  title: string; // ממ״ן 01 באינפי
  color: string;
  dateLabel: string; // 12.11
  weekday: string; // יום ה׳
  weight: number;
  relative: string; // בעוד 3 ימים
  urgent: boolean;
}

/** Upcoming deadlines; ticking one marks it submitted and removes it from the list. */
export function DeadlineList({
  rows,
  editable,
  empty,
}: {
  rows: DeadlineRowData[];
  editable: boolean;
  empty: React.ReactNode;
}) {
  const [visible, hide] = useOptimistic(rows, (state, key: string) => state.filter((r) => r.key !== key));
  const [, startTransition] = useTransition();

  if (visible.length === 0) return <div className="px-5 py-6 text-ink-soft">{empty}</div>;

  return (
    <ol className="divide-y divide-rule">
      {visible.map((r) => (
        <li key={r.key} className="flex items-center gap-4 px-4 py-3 sm:px-5">
          <div className="w-11 shrink-0 text-center leading-tight">
            <div className="text-[17px] font-semibold tabular-nums">{r.dateLabel}</div>
            <div className="text-[11px] text-ink-soft">{r.weekday}</div>
          </div>
          <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{r.title}</div>
            <div className="text-xs text-ink-soft">
              משקל {r.weight}, <span className={r.urgent ? "hl font-semibold" : undefined}>{r.relative}</span>
            </div>
          </div>
          {editable && (
            <button
              type="button"
              onClick={() =>
                startTransition(async () => {
                  hide(r.key);
                  await saveProgress({ code: r.code, n: r.n, status: "submitted", grade: null });
                })
              }
              className="shrink-0 rounded-full border border-rule px-3 py-1.5 text-sm text-ink-soft hover:border-ink hover:text-ink"
            >
              הוגש
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}
