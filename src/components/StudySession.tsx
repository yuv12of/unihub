"use client";

import { useMemo, useState, useTransition } from "react";
import { MathText } from "@/components/MathText";
import { reviewCard } from "@/app/act";
import type { Card } from "@/lib/userdata";
import Link from "next/link";
import { CourseChip } from "@/components/CourseChip";
import { Icon } from "@/components/Icon";
import { ScrollRow } from "@/components/Fold";

const GRADES: { g: 0 | 1 | 2 | 3; label: string; hint: string }[] = [
  { g: 0, label: "שוב", hint: "בעוד 10 דק׳" },
  { g: 1, label: "קשה", hint: "בקרוב" },
  { g: 2, label: "טוב", hint: "בעוד כמה ימים" },
  { g: 3, label: "קל", hint: "בעוד זמן רב" },
];

export function StudySession({
  cards,
  courses,
  total,
}: {
  /** all cards, due or not: 0 means none were made yet (a different empty state from "done for today") */
  total?: number;
  cards: Card[];
  courses: { code: string; name: string; color: string }[];
}) {
  const [course, setCourse] = useState<string | "all">("all");
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [, start] = useTransition();

  const queue = useMemo(
    () => cards.filter((c) => !doneIds.has(c.id) && (course === "all" || c.course_code === course)),
    [cards, doneIds, course],
  );
  const card = queue[0];
  const meta = card ? courses.find((c) => c.code === card.course_code) : undefined;

  const grade = (g: 0 | 1 | 2 | 3) => {
    if (!card) return;
    const id = card.id;
    setDoneIds((s) => new Set(s).add(id));
    setRevealed(false);
    setPicked(null);
    start(() => reviewCard(id, g));
  };

  if (total === 0)
    return (
      <div className="panel mt-6 max-w-2xl p-6 text-center sm:p-8">
        <Icon name="list" className="mx-auto size-8 text-ink-soft" />
        <h2 className="section-title mt-2">עוד אין כרטיסים</h2>
        <p className="mx-auto mt-1 max-w-md text-ink-soft">הכרטיסים נבנים כל בוקר מהפרקים של השבוע בספרי הקורס. הראשונים יגיעו מחר בבוקר.</p>
        <Link href="/books" className="btn mt-4">
          <Icon name="book" className="size-4" />
          לספרי הקורס
        </Link>
      </div>
    );

  return (
    <div className="mt-6">
      <ScrollRow className="mb-4 pb-1 sm:flex-wrap">
        <div role="tablist" aria-label="קורס" className="contents">
        {[{ code: "all", name: "כל הקורסים", color: "var(--ink)" }, ...courses].map((c) => (
          <button
            key={c.code}
            type="button"
            role="tab"
            aria-selected={course === c.code}
            onClick={() => {
              setCourse(c.code);
              setRevealed(false);
              setPicked(null);
            }}
            className={`chip shrink-0 ${course === c.code ? "is-on" : ""}`}
          >
            {c.code === "all" ? c.name : <CourseChip short={c.name} color={c.color} />}
          </button>
        ))}
        </div>
      </ScrollRow>

      {!card ? (
        <div className="panel max-w-2xl p-6">
          <h2 className="section-title">סיימת את החזרות להיום</h2>
          <p className="mt-1 text-ink-soft">כרטיסים חדשים נוספים כל בוקר לפי מה שלומדים השבוע, והכרטיסים שתרגלת יחזרו בזמן הנכון.</p>
        </div>
      ) : (
        <article className="panel max-w-2xl overflow-hidden" style={{ borderTop: `4px solid ${meta?.color ?? "var(--ink)"}` }}>
          <div className="flex items-center justify-between px-5 pt-4 text-xs text-ink-soft">
            <span>
              {meta?.name}
              {card.topic ? `, ${card.topic}` : ""}
            </span>
            <span>נשארו {queue.length}</span>
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
                        className={`w-full rounded-lg border border-rule px-4 py-2.5 text-start hover:border-ink ${state}`}
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
                <button type="button" onClick={() => setRevealed(true)} className="mt-5 rounded-lg bg-ink px-5 py-2.5 font-medium text-bg">
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
                {card.kind === "mcq" && picked !== null && (
                  <p className="font-medium">{picked === card.answer_index ? "נכון." : "לא בדיוק."}</p>
                )}
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
                  <button
                    key={x.g}
                    type="button"
                    onClick={() => grade(x.g)}
                    className="rounded-lg border border-rule px-2 py-2 text-center hover:border-ink"
                  >
                    <span className="block font-medium">{x.label}</span>
                    <span className="block text-[11px] text-ink-soft">{x.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </article>
      )}
      <p className="mt-4 max-w-2xl text-xs text-ink-soft">
        הכרטיסים נוצרים אוטומטית על ידי Claude מהסיכומים שלך ומנושאי הקורס. אם משהו נראה שגוי, סמנו &quot;שוב&quot; ובדקו מול הספר.
      </p>
    </div>
  );
}
