"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { MathText } from "@/components/MathText";
import { getPretest, markPretest, setQuestionStatus } from "@/app/act";
import type { BookQuestion } from "@/lib/books";

export type PretestState = { pretest: BookQuestion[] | null; check: BookQuestion[] | null };

/** Loads the chapter's pretest / check state once (quietly empty on any error). */
export function usePretest(chapterId: string) {
  const [state, setState] = useState<PretestState>({ pretest: null, check: null });
  useEffect(() => {
    let live = true;
    getPretest(chapterId)
      .then((s) => live && setState(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [chapterId]);
  return [state, setState] as const;
}

/**
 * Before reading a chapter for the first time: two of its questions, "try, no score". Getting
 * them wrong is expected; trying first helps the reading stick.
 */
export function PretestCard({ chapterId, questions, onDone }: { chapterId: string; questions: BookQuestion[]; onDone: (seen: BookQuestion[]) => void }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const close = () => {
    markPretest(chapterId, "pretest", questions.map((q) => ({ id: q.id }))).catch(() => {});
    onDone(questions);
  };
  return (
    <section className="panel mb-6 p-5" aria-labelledby="pretest-title" dir="rtl">
      <p className="text-xs font-medium text-ink-soft">לפני שקוראים</p>
      <h2 id="pretest-title" className="section-title mt-1">
        נסו לענות, בלי ציון
      </h2>
      <p className="mt-1 text-sm text-ink-soft">עוד לא קראתם את הפרק, אז טעות כאן צפויה. עצם הניסיון עוזר לזכור את מה שתקראו. אחרי הפרק השאלות האלה יחזרו.</p>
      <ol className="mt-4 space-y-4">
        {questions.map((q, i) => (
          <li key={q.id}>
            <p className="whitespace-pre-line leading-relaxed">
              <span className="me-1 text-ink-soft">{i + 1}.</span>
              <MathText text={q.prompt} />
            </p>
            <textarea
              dir="rtl" style={{ unicodeBidi: "plaintext" }}
              value={notes[q.id] ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, [q.id]: e.target.value }))}
              rows={2}
              placeholder="ניחוש, כיוון, מה שעולה בראש"
              aria-label={`ניחוש לשאלה ${i + 1}`}
              className="mt-2 w-full rounded-lg border border-rule bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none"
            />
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={close} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink px-5 font-medium text-bg">
          <Icon name="book" className="size-4" />
          עכשיו לקרוא
        </button>
      </div>
    </section>
  );
}

/** After the chapter is marked done: the same questions again, as a check. */
export function CheckCard({ chapterId, questions, onDone }: { chapterId: string; questions: BookQuestion[]; onDone: () => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [marks, setMarks] = useState<Record<string, "solved" | "stuck">>({});
  const all = questions.every((q) => marks[q.id]);
  const mark = (q: BookQuestion, m: "solved" | "stuck") => {
    setMarks((s) => ({ ...s, [q.id]: m }));
    setQuestionStatus(q.id, m).catch(() => {});
  };
  return (
    <section className="panel mt-6 p-5" aria-labelledby="check-title" dir="rtl">
      <p className="text-xs font-medium text-ink-soft">אחרי הפרק</p>
      <h2 id="check-title" className="section-title mt-1">
        אותן שאלות, עכשיו כבדיקה
      </h2>
      <p className="mt-1 text-sm text-ink-soft">אלה השאלות שניסיתם לפני הקריאה. נסו שוב, ואז השוו לפתרון.</p>
      <ol className="mt-4 space-y-4">
        {questions.map((q, i) => (
          <li key={q.id} className="rounded-xl border border-rule p-3">
            <p className="whitespace-pre-line leading-relaxed">
              <span className="me-1 text-ink-soft">{i + 1}.</span>
              <MathText text={q.prompt} />
            </p>
            {open[q.id] ? (
              <p className="mt-2 whitespace-pre-line rounded-lg bg-bg px-3 py-2 text-sm leading-relaxed">
                <MathText text={q.answer} />
              </p>
            ) : (
              <button type="button" onClick={() => setOpen((o) => ({ ...o, [q.id]: true }))} className="mt-2 min-h-10 rounded-full border border-rule px-4 text-sm hover:border-ink">
                הצגת הפתרון
              </button>
            )}
            {open[q.id] && (
              <div className="mt-2 flex gap-2 text-sm">
                <button type="button" onClick={() => mark(q, "solved")} aria-pressed={marks[q.id] === "solved"} className={`min-h-10 rounded-full px-4 ${marks[q.id] === "solved" ? "bg-ink text-bg" : "border border-rule"}`}>
                  ידעתי
                </button>
                <button type="button" onClick={() => mark(q, "stuck")} aria-pressed={marks[q.id] === "stuck"} className={`min-h-10 rounded-full px-4 ${marks[q.id] === "stuck" ? "bg-highlight text-highlight-ink" : "border border-rule"}`}>
                  עוד לא
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            // "later" only hides it for now; it comes back next time the chapter opens
            if (all) markPretest(chapterId, "check", questions.map((q) => ({ id: q.id, result: marks[q.id] }))).catch(() => {});
            onDone();
          }}
          className={`min-h-11 rounded-full px-5 font-medium ${all ? "bg-ink text-bg" : "border border-rule"}`}
        >
          {all ? "סיום" : "אחר כך"}
        </button>
      </div>
    </section>
  );
}
