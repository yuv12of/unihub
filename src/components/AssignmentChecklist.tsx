"use client";

import { useOptimistic, useTransition } from "react";
import { saveProgress } from "@/app/act";
import type { Progress, Status } from "@/lib/progress";

export interface ChecklistItem {
  n: string;
  label: string; // e.g. ממ״ן 01
  due: string; // display date
  weight: number;
  past: boolean;
  progress: Progress;
}

type Patch = { n: string; progress: Progress };

export function AssignmentChecklist({
  code,
  color,
  items,
  editable,
}: {
  code: string;
  color: string;
  items: ChecklistItem[];
  editable: boolean;
}) {
  const [optimistic, apply] = useOptimistic(items, (state, patch: Patch) =>
    state.map((it) => (it.n === patch.n ? { ...it, progress: patch.progress } : it)),
  );
  const [, startTransition] = useTransition();

  function save(n: string, status: Status, grade: number | null) {
    startTransition(async () => {
      apply({ n, progress: { status, grade } });
      await saveProgress({ code, n, status, grade });
    });
  }

  return (
    <ul className="mt-4 divide-y divide-rule border-t border-rule">
      {optimistic.map((it) => {
        const done = it.progress.status === "submitted";
        const skipped = it.progress.status === "skipped";
        return (
          <li key={it.n} className="flex items-center gap-3 py-2 min-h-11">
            <label className="flex flex-1 items-center gap-3 min-w-0 cursor-pointer">
              <input
                type="checkbox"
                className="size-5 shrink-0"
                style={{ accentColor: color }}
                checked={done}
                disabled={!editable}
                onChange={(e) => save(it.n, e.target.checked ? "submitted" : "todo", null)}
                aria-label={`${it.label} הוגש`}
              />
              <span className={`truncate ${skipped ? "line-through text-ink-soft" : ""}`}>
                {it.label}
                <span className="text-ink-soft text-sm"> {it.due}, משקל {it.weight}</span>
              </span>
            </label>
            {done ? (
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                placeholder="ציון"
                defaultValue={it.progress.grade ?? ""}
                disabled={!editable}
                onBlur={(e) => {
                  const v = e.target.value === "" ? null : Number(e.target.value);
                  if (v !== it.progress.grade) save(it.n, "submitted", v);
                }}
                className="w-16 shrink-0 rounded border border-rule bg-transparent px-2 py-1 text-center tabular-nums"
                aria-label={`ציון ב${it.label}`}
              />
            ) : (
              editable &&
              !it.past && (
                <button
                  type="button"
                  onClick={() => save(it.n, skipped ? "todo" : "skipped", null)}
                  className="shrink-0 text-xs text-ink-soft underline underline-offset-4 decoration-rule"
                >
                  {skipped ? "בטל ויתור" : "ויתור"}
                </button>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}
