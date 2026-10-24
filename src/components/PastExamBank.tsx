"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addPastExam, deletePastExam } from "@/app/act";
import { Icon } from "@/components/Icon";
import { duration } from "@/lib/time";

export interface BankRow {
  id: string;
  label: string;
  url: string | null;
  duration_minutes: number;
  questions: number;
  attempts: number;
  lastScore: number | null;
}

const field = "min-w-0 rounded-lg border border-rule bg-surface px-3 py-2 text-sm";

/** Past exams I collected (link to the PDF), and a timed mock exam for each. */
export function PastExamBank({ code, rows, editable }: { code: string; rows: BankRow[]; editable: boolean }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [questions, setQuestions] = useState("");
  const [minutes, setMinutes] = useState("180");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const done = rows.filter((r) => r.attempts > 0).length;

  return (
    <div>
      {rows.length > 0 && (
        <p className="text-sm text-ink-soft tabular-nums">
          נפתרו {done} מתוך {rows.length} בחינות קודמות
        </p>
      )}
      <ul className="mt-2 divide-y divide-rule border-y border-rule">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <span className="min-w-0 flex-1">
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                  <Icon name="clip" className="size-4 text-ink-soft" />
                  {r.label}
                </a>
              ) : (
                <span className="font-medium">{r.label}</span>
              )}
              <span className="block text-xs text-ink-soft">
                {duration(r.duration_minutes)}
                {r.questions ? ` · ${r.questions} שאלות` : ""}
                {r.attempts ? ` · נפתרה ${r.attempts === 1 ? "פעם אחת" : `${r.attempts} פעמים`}${r.lastScore != null ? `, לאחרונה ${r.lastScore}%` : ""}` : " · עוד לא נפתרה"}
              </span>
            </span>
            <Link href={`/courses/${code}/mock/${r.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-sm text-bg">
              <Icon name="timer" className="size-4" />
              בחינה לדוגמה
            </Link>
            {editable && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`למחוק את ${r.label}? גם הניסיונות שלה יימחקו.`)) return;
                  start(async () => {
                    try {
                      await deletePastExam(r.id);
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : "לא נמחק");
                    }
                  });
                }}
                className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-bg hover:text-ink"
                aria-label={`למחוק את ${r.label}`}
              >
                <Icon name="close" className="size-4" />
              </button>
            )}
          </li>
        ))}
        {!rows.length && <li className="py-3 text-sm text-ink-soft">עוד אין בחינות קודמות. הוסיפו קישור ל־PDF מאתר הקורס (״בחינות קודמות״) או רק שם.</li>}
      </ul>

      {editable && (
        <form
          className="mt-4 grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setErr(null);
              try {
                await addPastExam({ code, label, url, questions: Number(questions) || 0, duration: Number(minutes) || 180 });
                setLabel("");
                setUrl("");
                setQuestions("");
              } catch (e2) {
                setErr(e2 instanceof Error ? e2.message : "לא נשמר");
              }
            });
          }}
        >
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="שם, למשל 2025ב מועד 83" className={field} aria-label="שם הבחינה" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" dir="ltr" placeholder="https://… (לא חובה)" className={field} aria-label="קישור ל־PDF" />
          <div className="flex items-center gap-2 sm:col-span-2">
          <input value={questions} onChange={(e) => setQuestions(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="שאלות" className={`${field} w-20`} aria-label="מספר שאלות" />
          <label className="flex items-center gap-1 text-sm text-ink-soft">
            <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" className={`${field} w-16 text-center`} aria-label="משך בדקות" />
            דק׳
          </label>
          <button disabled={pending || (!label.trim() && !url.trim())} className="ms-auto inline-flex items-center justify-center gap-1 rounded-lg border border-rule px-3 py-2 text-sm disabled:opacity-50">
            <Icon name="plus" className="size-4" />
            הוספה
          </button>
          </div>
        </form>
      )}
      {err && <p className="mt-2 text-sm hl">{err}</p>}
    </div>
  );
}
