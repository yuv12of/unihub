"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

/** A short getting-started checklist for new accounts; disappears when done or dismissed. */
export function FirstSteps({ steps }: { steps: { label: string; href: string; done: boolean }[] }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem("firststeps:hidden") === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  const left = steps.filter((s) => !s.done).length;
  if (hidden || left === 0) return null;
  return (
    <section className="panel p-5" aria-label="צעדים ראשונים">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="section-title">ברוכים הבאים ל־Unihub</h2>
          <p className="text-sm text-ink-soft">
            עוד {left} {left === 1 ? "צעד" : "צעדים"}, והתוכנית בונה את עצמה.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem("firststeps:hidden", "1");
            } catch {}
          }}
          className="-m-2 grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-bg hover:text-ink"
          aria-label="הסתרה"
        >
          <Icon name="close" className="size-4" />
        </button>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={s.href}>
            <Link href={s.href} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-bg ${s.done ? "text-ink-soft" : ""}`}>
              <span className={`grid size-7 shrink-0 place-items-center rounded-full text-sm ${s.done ? "bg-highlight" : "border border-rule"}`}>{s.done ? <Icon name="check" className="size-4" /> : i + 1}</span>
              <span className={s.done ? "line-through" : "font-medium"}>{s.label}</span>
              {!s.done && <Icon name="chevronLeft" className="ms-auto size-4 text-ink-soft" />}
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-rule" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={steps.length - left} aria-label="התקדמות">
        <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${((steps.length - left) / steps.length) * 100}%` }} />
      </div>
    </section>
  );
}
