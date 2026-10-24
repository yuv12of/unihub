"use client";

import { useState, useTransition } from "react";
import { markPracticeSeen } from "@/app/act";
import { Icon } from "@/components/Icon";
import { MathText } from "@/components/MathText";
import type { PracticeMark } from "@/lib/practiceMarks";

const VERDICT: Record<string, string> = { correct: "נכון", error: "יש טעות", unclear: "לא הצלחתי לקרוא" };

/** One overnight feedback: which page, the first line that goes wrong, and a hint. */
export function PracticeMarkItem({ m, course, color, editable }: { m: PracticeMark; course: string; color: string; editable: boolean }) {
  const [seen, setSeen] = useState(m.seen);
  const [pending, start] = useTransition();
  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
        <span className="font-medium">
          {course}
          {m.exercise ? ` · תרגיל ${m.exercise}` : ""}
          {m.page > 1 ? ` · עמ׳ ${m.page}` : ""}
        </span>
        {m.verdict && <span className={`text-xs ${m.verdict === "error" ? "hl" : "text-ink-soft"}`}>{VERDICT[m.verdict]}</span>}
        {m.note?.url && (
          <a href={m.note.url} target="_blank" rel="noreferrer" className="ms-auto text-xs text-ink-soft underline decoration-rule underline-offset-2 hover:text-ink">
            הדף
          </a>
        )}
      </div>
      {m.first_wrong_line && (
        <p className="mt-1.5 rounded-md bg-bg px-2.5 py-1.5 text-sm">
          <span className="text-ink-soft">השורה הראשונה שלא מסתדרת: </span>
          <MathText text={m.first_wrong_line} />
        </p>
      )}
      <p className="mt-1.5 text-sm leading-relaxed">
        <Icon name="bulb" className="me-1 size-4 text-ink-soft" />
        <MathText text={m.feedback} />
      </p>
      {editable && !seen && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                await markPracticeSeen(m.id);
                setSeen(true);
              } catch {}
            })
          }
          className="mt-2 rounded-lg border border-rule px-3 py-1.5 text-xs hover:border-ink-soft"
        >
          ראיתי, אתקן
        </button>
      )}
    </li>
  );
}
