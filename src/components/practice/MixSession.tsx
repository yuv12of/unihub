"use client";

import { useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { MathText } from "@/components/MathText";
import { QuestionCard, type Mark } from "@/components/practice/QuestionCard";
import { recordAttempt, setQuestionStatus } from "@/app/act";
import { newSeed } from "@/lib/drills/rng";
import { pickMix, type MixItem, type PracticeChapter, type PracticeQuestion } from "@/lib/practice";

type CourseLite = { code: string; name: string; color: string };

/**
 * The mixed bag: ~10 questions from chapters I opened, across courses, shuffled, chapter hidden.
 * First "which chapter / method is this?", then solve and reveal.
 */
export function MixSession({ questions, chapters, courses }: { questions: PracticeQuestion[]; chapters: PracticeChapter[]; courses: CourseLite[] }) {
  const [seed, setSeed] = useState<number | null>(null);
  const [i, setI] = useState(0);
  const [guess, setGuess] = useState<string | null>(null);
  const [score, setScore] = useState({ picked: 0, solved: 0 });
  const [, start] = useTransition();

  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const chapter = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);
  const items: MixItem[] = useMemo(() => (seed === null ? [] : pickMix(questions, chapters, 10, seed)), [seed, questions, chapters]);
  const openedWithQs = new Set(questions.map((q) => q.chapter_id)).size;
  const courseOf = (code: string) => courses.find((c) => c.code === code);
  const multiCourse = new Set(questions.map((q) => q.course_code)).size > 1;

  if (!questions.length)
    return (
      <div className="panel max-w-2xl p-6">
        <h2 className="section-title">המיקס מחכה לפרקים</h2>
        <p className="mt-1 text-ink-soft">המיקס בוחר שאלות מפרקים שכבר פתחתם בספר. פתחו פרק אחד או שניים, והשאלות שלהם יופיעו כאן מעורבבות.</p>
      </div>
    );

  if (seed === null)
    return (
      <div className="panel max-w-2xl p-6">
        <h2 className="section-title">מיקס: שאלות מעורבבות</h2>
        <p className="mt-1 text-ink-soft">
          עד 10 שאלות מ־{openedWithQs} {openedWithQs === 1 ? "פרק שפתחת" : "פרקים שפתחת"}, בסדר אקראי ובלי שם הפרק. קודם מנחשים מאיזה פרק השאלה (איזו שיטה מתאימה), ורק אז פותרים. כך מתרגלים את מה שבמבחן באמת קשה: לזהות מה לעשות.
        </p>
        {openedWithQs < 3 && <p className="mt-2 text-sm text-ink-soft">עם יותר פרקים פתוחים המיקס נעשה מעניין יותר.</p>}
        <button type="button" onClick={() => setSeed(newSeed())} className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink px-5 font-medium text-bg">
          <Icon name="shuffle" className="size-4" />
          התחלה
        </button>
      </div>
    );

  const item = items[i];
  if (!item)
    return (
      <div className="panel max-w-2xl p-6">
        <h2 className="section-title">סוף המיקס</h2>
        <p className="mt-1 text-ink-soft">
          זיהית נכון את הפרק ב־{score.picked} מתוך {items.length}, ופתרת {score.solved}.
        </p>
        <button
          type="button"
          onClick={() => {
            setSeed(newSeed());
            setI(0);
            setGuess(null);
            setScore({ picked: 0, solved: 0 });
          }}
          className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink px-5 font-medium text-bg"
        >
          <Icon name="shuffle" className="size-4" />
          מיקס חדש
        </button>
      </div>
    );

  const q = byId.get(item.id)!;
  const own = chapter.get(item.chapter_id);
  const color = courseOf(q.course_code)?.color ?? "var(--ink)";
  const label = (cid: string) => {
    const c = chapter.get(cid);
    if (!c) return "";
    return multiCourse || c.course_code !== q.course_code ? `${courseOf(c.course_code)?.name ?? c.course_code} · ${c.title}` : c.title;
  };

  const mark = (m: Mark) => {
    const ok = guess === item.chapter_id;
    setScore((s) => ({ picked: s.picked + (ok ? 1 : 0), solved: s.solved + (m === "solved" ? 1 : 0) }));
    start(async () => {
      await Promise.allSettled([
        setQuestionStatus(q.id, m),
        recordAttempt({ kind: "mix", question_id: q.id, chapter_id: q.chapter_id, course_code: q.course_code, result: m, picked_ok: ok }),
      ]);
    });
    setGuess(null);
    setI((n) => n + 1);
  };

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center gap-2 text-xs text-ink-soft" aria-label="התקדמות">
        <span className="tabular-nums">
          {i + 1}/{items.length}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-rule">
          <div className="h-full rounded-full bg-ink" style={{ width: `${(i / items.length) * 100}%` }} />
        </div>
      </div>

      {guess === null ? (
        <article className="panel overflow-hidden" style={{ borderTop: "4px solid var(--ink-soft)" }}>
          <div className="px-5 pb-5 pt-4">
            <p className="text-xs text-ink-soft">שאלה מהמיקס</p>
            <p className="mt-2 whitespace-pre-line text-lg leading-relaxed" dir="rtl">
              <MathText text={q.prompt} />
            </p>
            <h3 className="mt-5 font-medium">מאיזה פרק זה? (איזו שיטה תעבוד כאן)</h3>
            <div className="mt-2 grid gap-2">
              {item.choices.map((cid) => (
                <button key={cid} type="button" onClick={() => setGuess(cid)} className="min-h-12 rounded-lg border border-rule px-4 py-2 text-start hover:border-ink">
                  {label(cid)}
                </button>
              ))}
            </div>
          </div>
        </article>
      ) : (
        <>
          <p
            className={`rounded-xl px-4 py-3 text-sm ${guess === item.chapter_id ? "bg-[color:color-mix(in_srgb,var(--c-calculus)_14%,transparent)]" : "bg-[color:color-mix(in_srgb,var(--highlight)_35%,transparent)] text-ink"}`}
            role="status"
          >
            {guess === item.chapter_id ? "זיהית נכון: " : `לא בדיוק. בחרת "${label(guess)}". השאלה מ־`}
            <strong>{own ? label(own.id) : ""}</strong>. עכשיו לפתור.
          </p>
          <QuestionCard key={q.id} q={q} color={color} courseName={courseOf(q.course_code)?.name ?? q.course_code} onMark={mark} />
        </>
      )}
    </div>
  );
}
