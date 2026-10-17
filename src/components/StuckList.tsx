"use client";

import { useOptimistic, useTransition } from "react";
import { resolveStuck } from "@/app/act";
import type { StuckPoint } from "@/lib/userdata";

/** What you got stuck on during focus sessions, to ask the tutor or turn into practice. */
export function StuckList({ items }: { items: StuckPoint[] }) {
  const [list, apply] = useOptimistic(items, (s, id: string) => s.map((x) => (x.id === id ? { ...x, resolved: !x.resolved } : x)));
  const [, start] = useTransition();
  const open = list.filter((x) => !x.resolved);
  if (!list.length) return null;
  return (
    <div className="border-t border-rule px-5 py-4">
      <h3 className="text-sm font-semibold">נקודות שנתקעתי בהן {open.length ? `(${open.length})` : ""}</h3>
      <p className="text-xs text-ink-soft">טובות לשאלה במפגש ההנחיה או בפורום.</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {list.slice(0, 10).map((x) => (
          <li key={x.id} className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={x.resolved}
              onChange={() =>
                start(async () => {
                  apply(x.id);
                  await resolveStuck(x.id, !x.resolved);
                })
              }
              className="mt-1 size-4"
              aria-label="נפתר"
            />
            <span className={x.resolved ? "text-ink-soft line-through" : ""}>{x.topic}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
