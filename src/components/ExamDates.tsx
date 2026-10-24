"use client";

import { useEffect, useState, useTransition } from "react";
import { saveCourseExams } from "@/app/act";
import { Icon } from "@/components/Icon";

export interface ExamRow {
  moed: string;
  date: string;
  start_time: string | null;
  chosen?: boolean | null;
  mocks?: boolean | null;
}

const field = "min-w-0 rounded-lg border border-rule bg-surface px-3 py-2";

/** מועד א / ב dates and times, which one I'm taking, and mock exams in the plan. */
export function ExamDates({ code, exams, editable, onSaved }: { code: string; exams: ExamRow[]; editable: boolean; onSaved?: () => void }) {
  const of = (m: string) => exams.find((e) => e.moed === m);
  const [a, setA] = useState({ date: of("א")?.date ?? "", time: of("א")?.start_time ?? "" });
  const [b, setB] = useState({ date: of("ב")?.date ?? "", time: of("ב")?.start_time ?? "" });
  const [chosen, setChosen] = useState<"א" | "ב">(of("ב")?.chosen ? "ב" : "א");
  const [mocks, setMocks] = useState(exams.length ? exams.every((e) => e.mocks !== false) : true);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();

  const row = (moed: "א" | "ב", v: { date: string; time: string }, set: (v: { date: string; time: string }) => void) => (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex w-full shrink-0 items-center gap-1.5 sm:w-24">
        <input type="radio" name={`moed-${code}`} checked={chosen === moed} onChange={() => setChosen(moed)} disabled={!editable} className="size-4" />
        מועד {moed}
      </label>
      <input type="date" value={v.date} onChange={(e) => set({ ...v, date: e.target.value })} disabled={!editable} className={`${field} flex-1`} dir="ltr" aria-label={`תאריך מועד ${moed}`} />
      <input type="time" value={v.time} onChange={(e) => set({ ...v, time: e.target.value })} disabled={!editable} className={`${field} w-32`} dir="ltr" aria-label={`שעת מועד ${moed}`} />
    </div>
  );

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await saveCourseExams({ code, a, b, chosen, mocks });
            setMsg({ text: "נשמר. התוכנית עודכנה." });
            onSaved?.();
          } catch (err) {
            setMsg({ text: err instanceof Error ? err.message : "לא נשמר", bad: true });
          }
        });
      }}
    >
      {row("א", a, setA)}
      {row("ב", b, setB)}
      <p className="text-xs text-ink-soft">העיגול מסמן לאיזה מועד את/ה ניגש/ת. החזרות בתוכנית מתוכננות רק לקראתו.</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={mocks} onChange={(e) => setMocks(e.target.checked)} disabled={!editable} className="size-4" />
        בחינה לדוגמה (3 שעות) פעם בשבוע, בשלושת השבועות שלפני הבחינה
      </label>
      <div className="flex items-center gap-3">
        <button disabled={!editable || pending} className="rounded-lg bg-ink px-4 py-2 text-sm text-bg disabled:opacity-50">
          {pending ? "שומר…" : "שמירה"}
        </button>
        {msg && <span className={`text-sm ${msg.bad ? "hl" : "text-ink-soft"}`}>{msg.text}</span>}
        {!editable && <span className="text-xs text-ink-soft">בתצוגה לדוגמה אי אפשר לשמור</span>}
      </div>
    </form>
  );
}

/** One line until exam dates are entered; opens the form in place. Dismissible per course. */
export function ExamNag({ code, editable }: { code: string; editable: boolean }) {
  const key = `examnag:${code}`;
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from localStorage after mount
      setHidden(localStorage.getItem(key) === "1");
    } catch {
      setHidden(false);
    }
  }, [key]);
  if (hidden) return null;
  return (
    <div className="panel mt-4 px-4 py-3 text-sm">
      <div className="flex items-center gap-3">
        <Icon name="calendar" className="size-4 shrink-0 text-ink-soft" />
        <p className="min-w-0 flex-1">
          מועדי הבחינה עוד לא הוזנו. כשיתפרסמו בשאילתא,{" "}
          <button type="button" onClick={() => setOpen((o) => !o)} className="font-medium underline decoration-rule underline-offset-4">
            {open ? "סגירה" : "להזין כאן"}
          </button>
          .
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(key, "1");
            } catch {}
            setHidden(true);
          }}
          className="grid size-8 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-bg hover:text-ink"
          aria-label="להסתיר את התזכורת"
        >
          <Icon name="close" className="size-4" />
        </button>
      </div>
      {open && (
        <div className="mt-3 border-t border-rule pt-3">
          <ExamDates code={code} exams={[]} editable={editable} />
        </div>
      )}
    </div>
  );
}
