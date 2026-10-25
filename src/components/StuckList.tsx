"use client";

import { MathText } from "@/components/MathText";
import { useOptimistic, useState, useTransition } from "react";
import { resolveStuck } from "@/app/act";
import type { StuckPoint } from "@/lib/userdata";
import type { AskContext } from "@/app/practiceActions";
import { AskTutor } from "@/components/practice/AskTutor";

/**
 * What you got stuck on (focus sessions, book questions). Each open one can become a question for
 * the tutor: forum post, mail draft, or the next phone-tutoring hour.
 */
export function StuckList({
  items,
  bare = false,
  contexts,
}: {
  items: StuckPoint[];
  /** without the border and heading (when the caller has its own) */
  bare?: boolean;
  /** preloaded ask contexts by stuck id (otherwise fetched when a question is opened) */
  contexts?: Record<string, AskContext>;
}) {
  const [list, apply] = useOptimistic(items, (s, id: string) => s.map((x) => (x.id === id ? { ...x, resolved: !x.resolved } : x)));
  const [, start] = useTransition();
  const [asking, setAsking] = useState<string | null>(null);
  const open = list.filter((x) => !x.resolved);
  if (!list.length) return null;
  return (
    <div className={bare ? "" : "border-t border-rule px-5 py-4"}>
      {!bare && (
        <>
          <h3 className="text-sm font-semibold">נקודות שנתקעתי בהן {open.length ? `(${open.length})` : ""}</h3>
          <p className="text-xs text-ink-soft">כל אחת יכולה להפוך לשאלה למנחה: פורום, מייל או הנחיה טלפונית.</p>
        </>
      )}
      <ul className="mt-2 space-y-1.5 text-sm">
        {list.slice(0, 10).map((x) => (
          <li key={x.id}>
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={x.resolved}
                onChange={() =>
                  start(async () => {
                    apply(x.id);
                    await resolveStuck(x.id, !x.resolved);
                  })
                }
                className="mt-1 size-4 shrink-0"
                aria-label="נפתר"
              />
              <span className={`min-w-0 flex-1 ${x.resolved ? "text-ink-soft line-through" : ""}`}><MathText text={x.topic} /></span>
              {!x.resolved && (
                <button
                  type="button"
                  onClick={() => setAsking(asking === x.id ? null : x.id)}
                  aria-expanded={asking === x.id}
                  className="shrink-0 rounded-full border border-rule px-3 py-1 text-xs hover:border-ink"
                >
                  {asking === x.id ? "סגירה" : "לשאלה"}
                </button>
              )}
            </div>
            {asking === x.id && <AskTutor stuck={x} initial={contexts?.[x.id]} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
