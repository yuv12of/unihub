"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { MathText } from "@/components/MathText";
import { stuckFromQuestion } from "@/app/act";
import { bookHref, type PracticeQuestion } from "@/lib/practice";

export type Mark = "solved" | "stuck" | "skipped";
const LEVEL = ["", "קלה", "בינונית", "מאתגרת"];

/**
 * One book question: try it, then reveal the hint, then the answer, then mark it yourself.
 * `header` replaces the chapter line (the mix hides it until the chapter is guessed).
 */
export function QuestionCard({
  q,
  color,
  courseName,
  hideSource = false,
  onMark,
  remaining,
}: {
  q: PracticeQuestion;
  color: string;
  courseName: string;
  hideSource?: boolean;
  onMark: (m: Mark) => void;
  remaining?: number;
}) {
  const [open, setOpen] = useState<"none" | "hint" | "answer">("none");
  const [stuck, setStuck] = useState<"no" | "asking" | "saved" | "failed">("no");
  const href = bookHref(q);

  return (
    <article className="panel max-w-2xl overflow-hidden" style={{ borderTop: `4px solid ${color}` }}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 text-xs text-ink-soft">
        <span className="min-w-0 truncate">
          {hideSource ? "שאלה מהמיקס" : `${courseName} · ${q.chapter_title}`} · {LEVEL[q.difficulty] ?? ""}
        </span>
        {remaining !== undefined && <span className="shrink-0">נשארו {remaining}</span>}
      </div>
      <div className="px-5 pb-5 pt-3">
        <p className="whitespace-pre-line text-lg leading-relaxed" dir="auto">
          <MathText text={q.prompt} />
        </p>

        {open !== "none" && (
          <div className="mt-4 space-y-3 rounded-xl bg-bg px-4 py-3">
            {q.hint && (
              <p className="flex gap-2 text-sm">
                <Icon name="bulb" className="mt-0.5 size-4 shrink-0 text-ink-soft" />
                <span className="whitespace-pre-line" dir="auto">
                  <MathText text={q.hint} />
                </span>
              </p>
            )}
            {open === "answer" && (
              <p className="whitespace-pre-line leading-relaxed" dir="auto">
                <MathText text={q.answer} />
              </p>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {open === "none" && q.hint && (
            <button type="button" onClick={() => setOpen("hint")} className="min-h-11 rounded-full border border-rule px-5 hover:border-ink">
              רמז
            </button>
          )}
          {open !== "answer" && (
            <button type="button" onClick={() => setOpen("answer")} className="min-h-11 rounded-full bg-ink px-5 font-medium text-bg">
              הצגת הפתרון
            </button>
          )}
          {!hideSource && (
            <Link href={href} className="ms-auto inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
              <Icon name="book" className="size-4" />
              {q.page ? `עמ׳ ${q.page} בפרק` : "לפרק בספר"}
            </Link>
          )}
        </div>

        {open === "answer" && (
          <>
            <p className="mt-5 text-sm text-ink-soft">איך הלך?</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => onMark("solved")} className="min-h-12 rounded-lg border border-rule font-medium hover:border-ink">
                פתרתי
              </button>
              <button
                type="button"
                onClick={() => {
                  if (stuck === "no") setStuck("asking");
                  else onMark("stuck");
                }}
                className={`min-h-12 rounded-lg border font-medium ${stuck !== "no" ? "border-transparent bg-highlight text-highlight-ink" : "border-rule hover:border-ink"}`}
              >
                נתקעתי
              </button>
              <button type="button" onClick={() => onMark("skipped")} className="min-h-12 rounded-lg border border-rule text-ink-soft hover:border-ink">
                דילוג
              </button>
            </div>
            {stuck !== "no" && (
              <div className="mt-3 rounded-xl border border-rule p-3 text-sm">
                {stuck === "saved" ? (
                  <p>נוספה לשאלות למנחה, עם קישור לעמוד בספר.</p>
                ) : stuck === "failed" ? (
                  <p className="text-ink-soft">לא הצלחתי לשמור. אפשר להוסיף ידנית מדף הקורס.</p>
                ) : (
                  <p>לשמור אותה כשאלה למנחה (הנחיה טלפונית, פורום או מפגש)?</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {stuck === "asking" && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await stuckFromQuestion(q.id);
                          setStuck("saved");
                        } catch {
                          setStuck("failed");
                        }
                      }}
                      className="min-h-10 rounded-full bg-ink px-4 text-bg"
                    >
                      כן, לשאלות למנחה
                    </button>
                  )}
                  <button type="button" onClick={() => onMark("stuck")} className="min-h-10 rounded-full border border-rule px-4 hover:border-ink">
                    {stuck === "asking" ? "לא, להמשיך" : "להמשיך"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}
