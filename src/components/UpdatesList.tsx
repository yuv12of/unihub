"use client";

import { useTransition } from "react";
import Link from "next/link";
import { applyUpdate, dismissUpdate } from "@/app/act";
import type { Update } from "@/lib/userdata";

const icon: Record<Update["kind"], string> = {
  deadline: "⏳",
  tutorial_cancel: "✕",
  tutorial_new: "＋",
  grade: "✓",
  info: "!",
};

/** Schedule changes found in university mail. Sure ones are already applied; the rest wait for one tap. */
export function UpdatesList({ updates }: { updates: Update[] }) {
  const [pending, start] = useTransition();
  return (
    <div>
      <h2 className="section-title mb-3">עדכונים מהדואר</h2>
      <ul className="panel divide-y divide-rule overflow-hidden" aria-busy={pending}>
        {updates.map((u) => (
          <li key={u.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
            <span
              className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-sm ${
                u.status === "pending" ? "bg-highlight text-ink" : "bg-rule/70 text-ink-soft"
              }`}
              aria-hidden
            >
              {icon[u.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug">{u.title}</p>
              <p className="mt-0.5 text-sm text-ink-soft">
                {u.status === "applied" ? "עודכן אוטומטית. " : ""}
                {u.detail}{" "}
                {u.mail_id && (
                  <Link href={`/mail?open=${u.mail_id}`} className="underline underline-offset-4 decoration-rule hover:text-ink">
                    למייל
                  </Link>
                )}
              </p>
            </div>
            <span className="flex shrink-0 gap-1.5">
              {u.status === "pending" && u.kind !== "info" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(() => applyUpdate(u.id))}
                  className="rounded-full bg-ink px-3 py-1.5 text-sm text-bg"
                >
                  עדכון
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => start(() => dismissUpdate(u.id))}
                className="rounded-full border border-rule px-3 py-1.5 text-sm text-ink-soft hover:border-ink"
                aria-label="הסתרה"
              >
                {u.status === "pending" && u.kind !== "info" ? "לא" : "הבנתי"}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
