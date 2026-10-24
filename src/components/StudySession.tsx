"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { MathText } from "@/components/MathText";
import { QuestionCard, type Mark } from "@/components/practice/QuestionCard";
import { MixSession } from "@/components/practice/MixSession";
import { recordAttempt, reviewCard, setQuestionStatus } from "@/app/act";
import type { Card } from "@/lib/userdata";
import { dueQuestions, type PracticeChapter, type PracticeQuestion } from "@/lib/practice";

const GRADES: { g: 0 | 1 | 2 | 3; label: string; hint: string }[] = [
  { g: 0, label: "שוב", hint: "בעוד 10 דק׳" },
  { g: 1, label: "קשה", hint: "בקרוב" },
  { g: 2, label: "טוב", hint: "בעוד כמה ימים" },
  { g: 3, label: "קל", hint: "בעוד זמן רב" },
];

type CourseLite = { code: string; name: string; color: string };
type Item = { type: "card"; card: Card } | { type: "q"; q: PracticeQuestion };

/**
 * The practice page: what's due today (flashcards and the open questions of chapters I opened),
 * the mixed bag, and a way into the endless drills. One course filter for all of it.
 */
export function StudySession({
  cards,
  questions,
  chapters,
  answeredToday,
  courses,
  initialCourse = "all",
  initialMode = "today",
}: {
  cards: Card[];
  questions: PracticeQuestion[];
  chapters: PracticeChapter[];
  answeredToday: string[];
  courses: CourseLite[];
  initialCourse?: string;
  initialMode?: "today" | "mix";
}) {
  const [mode, setMode] = useState<"today" | "mix">(initialMode);
  const [course, setCourse] = useState<string>(courses.some((c) => c.code === initialCourse) ? initialCourse : "all");
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState({ cards: 0, questions: 0 });
  const [, start] = useTransition();

  const opened = useMemo(() => new Set(chapters.filter((c) => c.opened).map((c) => c.id)), [chapters]);
  const dueQs = useMemo(() => dueQuestions(questions, opened, new Set(answeredToday)), [questions, opened, answeredToday]);

  // everything due today, per course: the one source for every count on the page
  const all: Item[] = useMemo(
    () => [...cards.map((card) => ({ type: "card" as const, card })), ...dueQs.map((q) => ({ type: "q" as const, q }))],
    [cards, dueQs],
  );
  const codeOf = (it: Item) => (it.type === "card" ? it.card.course_code : it.q.course_code);
  const idOf = (it: Item) => (it.type === "card" ? it.card.id : it.q.id);
  const left = all.filter((it) => !doneIds.has(idOf(it)));
  const leftBy = (code: string) => left.filter((it) => code === "all" || codeOf(it) === code);
  const queue = leftBy(course);
  const item = queue[0];
  const meta = (code: string) => courses.find((c) => c.code === code);
  const name = (code: string) => meta(code)?.name ?? code;

  const done = (id: string) => setDoneIds((s) => new Set(s).add(id));
  const gradeCard = (card: Card, g: 0 | 1 | 2 | 3) => {
    done(card.id);
    setCounts((c) => ({ ...c, cards: c.cards + 1 }));
    start(() => reviewCard(card.id, g).catch(() => {}));
  };
  const markQ = (q: PracticeQuestion, m: Mark) => {
    done(q.id);
    setCounts((c) => ({ ...c, questions: c.questions + 1 }));
    start(async () => {
      await Promise.allSettled([
        setQuestionStatus(q.id, m),
        recordAttempt({ kind: "question", question_id: q.id, chapter_id: q.chapter_id, course_code: q.course_code, result: m }),
      ]);
    });
  };

  const nCards = queue.filter((i) => i.type === "card").length;
  const nQs = queue.length - nCards;
  const mixPool = questions.filter((q) => opened.has(q.chapter_id) && (course === "all" || q.course_code === course));
  const hasAnyChapterOpened = questions.some((q) => opened.has(q.chapter_id));

  return (
    <div className="mt-6">
      {/* modes */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-rule p-1" role="tablist" aria-label="מצב תרגול">
          {(
            [
              ["today", "להיום"],
              ["mix", "מיקס"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={mode === k}
              onClick={() => setMode(k)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm ${mode === k ? "bg-ink text-bg" : "text-ink-soft hover:text-ink"}`}
            >
              {k === "mix" && <Icon name="shuffle" className="size-4" />}
              {label}
              {k === "today" && left.length > 0 && <span className="tabular-nums opacity-70">{leftBy(course).length}</span>}
            </button>
          ))}
        </div>
        <Link href="/study/drills" className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-rule px-4 text-sm hover:border-ink">
          <Icon name="grid" className="size-4" />
          תרגול אינסופי
        </Link>
      </div>

      {/* course filter */}
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="קורס">
        {[{ code: "all", name: "כל הקורסים", color: "var(--ink)" }, ...courses].map((c) => {
          const n = mode === "today" ? leftBy(c.code).length : 0;
          return (
            <button
              key={c.code}
              type="button"
              role="tab"
              aria-selected={course === c.code}
              onClick={() => setCourse(c.code)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm ${course === c.code ? "border-ink bg-ink text-bg" : "border-rule text-ink-soft hover:border-ink"}`}
            >
              {c.code !== "all" && <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden />}
              {c.name}
              {mode === "today" && n > 0 && <span className="tabular-nums opacity-70">{n}</span>}
            </button>
          );
        })}
      </div>

      {mode === "mix" ? (
        <MixSession key={course} questions={mixPool} chapters={chapters} courses={courses} />
      ) : (
        <>
          {item && (
            <p className="mb-3 text-sm text-ink-soft">
              להיום{course !== "all" ? ` ב${name(course)}` : ""}: {[nCards ? `${nCards} כרטיסיות` : "", nQs ? `${nQs} שאלות מהפרקים` : ""].filter(Boolean).join(" · ")}
            </p>
          )}
          {!item ? (
            <Empty
              course={course}
              courseName={name(course)}
              others={courses.filter((c) => c.code !== course && leftBy(c.code).length > 0).map((c) => ({ ...c, n: leftBy(c.code).length }))}
              did={counts}
              hasAnyChapterOpened={hasAnyChapterOpened}
              hasCards={cards.length > 0}
              onCourse={setCourse}
              onMix={() => setMode("mix")}
            />
          ) : item.type === "card" ? (
            <CardView key={item.card.id} card={item.card} color={meta(item.card.course_code)?.color ?? "var(--ink)"} courseName={name(item.card.course_code)} remaining={queue.length} onGrade={(g) => gradeCard(item.card, g)} />
          ) : (
            <QuestionCard key={item.q.id} q={item.q} color={meta(item.q.course_code)?.color ?? "var(--ink)"} courseName={name(item.q.course_code)} remaining={queue.length} onMark={(m) => markQ(item.q, m)} />
          )}
          <p className="mt-4 max-w-2xl text-xs text-ink-soft">
            הכרטיסיות והשאלות נכתבות אוטומטית מהספרים ומהסיכומים. שאלה שסימנתם &quot;נתקעתי&quot; או &quot;דילוג&quot; תחזור מחר; &quot;פתרתי&quot; יוצאת מהרשימה.
          </p>
        </>
      )}
    </div>
  );
}

function Empty({
  course,
  courseName,
  others,
  did,
  hasAnyChapterOpened,
  hasCards,
  onCourse,
  onMix,
}: {
  course: string;
  courseName: string;
  others: (CourseLite & { n: number })[];
  did: { cards: number; questions: number };
  hasAnyChapterOpened: boolean;
  hasCards: boolean;
  onCourse: (c: string) => void;
  onMix: () => void;
}) {
  const didAny = did.cards + did.questions > 0;
  const where = course === "all" ? "" : ` ב${courseName}`;
  const nothingYet = !hasCards && !hasAnyChapterOpened && !didAny;
  return (
    <div className="panel max-w-2xl p-6">
      <h2 className="section-title">
        {didAny ? `סיימת להיום${where}` : nothingYet ? "עוד אין מה לתרגל" : `אין מה לחזור עליו היום${where}`}
      </h2>
      <p className="mt-1 text-ink-soft">
        {didAny
          ? `עברת על ${[did.cards ? `${did.cards} כרטיסיות` : "", did.questions ? `${did.questions} שאלות` : ""].filter(Boolean).join(" ו־")}. מה שתרגלת יחזור בזמן הנכון.`
          : nothingYet
            ? "שאלות הפרקים מופיעות כאן אחרי שפותחים פרק בספר, וכרטיסיות חדשות נוספות כל בוקר לפי מה שלומדים השבוע."
            : "כרטיסיות חדשות נוספות כל בוקר, ושאלות של פרק מופיעות כאן מרגע שפותחים אותו."}
      </p>
      {others.length > 0 && (
        <div className="mt-4">
          <p className="text-sm">בקורסים אחרים יש מה לחזור:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {others.map((c) => (
              <button key={c.code} type="button" onClick={() => onCourse(c.code)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-rule px-4 text-sm hover:border-ink">
                <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden />
                {c.name} <span className="tabular-nums text-ink-soft">{c.n}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        {hasAnyChapterOpened && (
          <button type="button" onClick={onMix} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink px-5 font-medium text-bg">
            <Icon name="shuffle" className="size-4" />
            מיקס מהפרקים שקראתי
          </button>
        )}
        <Link href="/study/drills" className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-5 ${hasAnyChapterOpened ? "border border-rule hover:border-ink" : "bg-ink font-medium text-bg"}`}>
          <Icon name="grid" className="size-4" />
          תרגול אינסופי
        </Link>
        {!hasAnyChapterOpened && (
          <Link href="/books" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-rule px-5 hover:border-ink">
            <Icon name="book" className="size-4" />
            לספרים
          </Link>
        )}
      </div>
    </div>
  );
}

function CardView({ card, color, courseName, remaining, onGrade }: { card: Card; color: string; courseName: string; remaining: number; onGrade: (g: 0 | 1 | 2 | 3) => void }) {
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <article className="panel max-w-2xl overflow-hidden" style={{ borderTop: `4px solid ${color}` }}>
      <div className="flex items-center justify-between px-5 pt-4 text-xs text-ink-soft">
        <span>
          כרטיסייה · {courseName}
          {card.topic ? `, ${card.topic}` : ""}
        </span>
        <span>נשארו {remaining}</span>
      </div>
      <div className="px-5 pb-5 pt-3">
        <p className="whitespace-pre-wrap text-lg leading-relaxed" dir="auto">
          <MathText text={card.front} />
        </p>

        {card.kind === "mcq" && card.options ? (
          <ol className="mt-4 space-y-2">
            {card.options.map((o, i) => {
              const correct = i === card.answer_index;
              const state =
                picked === null ? "" : correct ? "border-[color:var(--c-calculus)] bg-[color:color-mix(in_srgb,var(--c-calculus)_12%,transparent)]" : i === picked ? "border-ink-soft opacity-70" : "opacity-60";
              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={picked !== null}
                    onClick={() => {
                      setPicked(i);
                      setRevealed(true);
                    }}
                    className={`min-h-11 w-full rounded-lg border border-rule px-4 py-2.5 text-start hover:border-ink ${state}`}
                    dir="auto"
                  >
                    <MathText text={o} />
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          !revealed && (
            <button type="button" onClick={() => setRevealed(true)} className="mt-5 min-h-11 rounded-full bg-ink px-5 font-medium text-bg">
              הצגת התשובה
            </button>
          )
        )}

        {revealed && (
          <div className="mt-4 rounded-xl bg-bg px-4 py-3">
            {card.kind === "flash" && card.back && (
              <p className="whitespace-pre-wrap leading-relaxed" dir="auto">
                <MathText text={card.back} />
              </p>
            )}
            {card.kind === "mcq" && picked !== null && <p className="font-medium">{picked === card.answer_index ? "נכון." : "לא בדיוק."}</p>}
            {card.explanation && (
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft" dir="auto">
                <MathText text={card.explanation} />
              </p>
            )}
          </div>
        )}

        {revealed && (
          <div className="mt-4 grid grid-cols-4 gap-2">
            {(card.kind === "mcq" ? GRADES.filter((x) => (picked === card.answer_index ? x.g >= 1 : x.g <= 1)) : GRADES).map((x) => (
              <button key={x.g} type="button" onClick={() => onGrade(x.g)} className="min-h-12 rounded-lg border border-rule px-2 py-2 text-center hover:border-ink">
                <span className="block font-medium">{x.label}</span>
                <span className="block text-[11px] text-ink-soft">{x.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
