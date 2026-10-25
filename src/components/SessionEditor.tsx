"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { setSessionMove } from "@/app/act";
import { Icon } from "@/components/Icon";
import { duration } from "@/lib/time";

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const LENGTHS = [30, 45, 60, 90, 120];

export type EditorCourse = { code: string; short: string; color: string };

/**
 * Change one planned study session: another course, another day (up to two weeks from the planned
 * one), another time, another length; or put it back where the plan had it.
 * `sessionKey` is the key the plan gave the session (Session.moveKey ?? sessionKey(session)).
 */
export function SessionEditor({
  sessionKey,
  title,
  date: date0,
  start: start0,
  minutes: minutes0,
  moved,
  today,
  courseCode,
  courses = [],
  onClose,
  onDone,
}: {
  sessionKey: string;
  /** the course the session is for now */
  courseCode: string;
  /** the user's courses, to study another one in this slot */
  courses?: EditorCourse[];
  title: string;
  date: string;
  start: string;
  minutes: number;
  moved: boolean;
  today: string;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const planned = sessionKey.slice(0, 10);
  const [, plannedKind, plannedCode] = sessionKey.split("|");
  const [code, setCode] = useState(courseCode);
  const swapped = code !== plannedCode;
  const short = (c: string) => courses.find((x) => x.code === c)?.short ?? c;
  const [date, setDate] = useState(date0);
  const [start, setStart] = useState(start0);
  const [minutes, setMinutes] = useState(minutes0);
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  const end = start ? hhmm(Math.min(toMin(start) + minutes, 24 * 60)).replace("24:00", "00:00") : "";
  const tooLate = start ? toMin(start) + minutes > 24 * 60 : false;
  const go = (fn: () => Promise<void>, text: string) =>
    run(async () => {
      setError(null);
      try {
        await fn();
        onDone(text);
        onClose();
      } catch (e) {
        setError((e as Error).message || "השמירה נכשלה. נסו שוב.");
      }
    });

  const field = "rounded-lg border border-rule-strong bg-surface px-2 py-1.5";
  const min = today > addDays(planned, -13) ? today : addDays(planned, -13);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center sm:p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-editor-title"
        className={`panel max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-b-none p-5 sm:rounded-b-[inherit] ${pending ? "opacity-70" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (tooLate) return setError("המפגש צריך להסתיים עד חצות");
          go(
            () => setSessionMove(sessionKey, { date, start, minutes, code: swapped ? code : null }),
            code !== courseCode ? `המפגש עכשיו ב${short(code)}` : date !== date0 ? "המפגש הוזז ליום אחר" : "המפגש עודכן",
          );
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="session-editor-title" className="section-title">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="rounded-lg p-1.5 text-ink-soft hover:bg-bg hover:text-ink">
            <Icon name="close" className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          {moved ? "המפגש הזה כבר הוזז ממקומו בתוכנית." : "מפגש לימוד מהתוכנית."} מפגשים אחרים שיחפפו באותו יום יזוזו לזמן הפנוי הבא.
        </p>

        <div className="mt-4 space-y-4 text-sm">
          {courses.length > 1 && (
            <fieldset>
              <legend className="mb-2 text-ink-soft">קורס</legend>
              <div className="flex flex-wrap items-center gap-1.5">
                {courses.map((c) => (
                  <button key={c.code} type="button" aria-pressed={code === c.code} onClick={() => setCode(c.code)} className="chip gap-1.5 text-sm">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
                    {c.short}
                    {c.code === plannedCode && <span className="text-xs text-ink-soft">(בתוכנית)</span>}
                  </button>
                ))}
              </div>
              {swapped && plannedKind !== "routine" && (
                <p className="mt-2 text-xs text-ink-soft">
                  המפגש הזה תוכנן כהכנה ל{plannedKind === "exam" ? "בחינה" : "מטלה"} ב{short(plannedCode)}. הזמן הזה לא יתוכנן מחדש, אז כדאי לוודא שנשאר מספיק זמן לפני המועד.
                </p>
              )}
            </fieldset>
          )}
          <label className="flex items-center gap-3">
            <Icon name="calendar" className="size-4 text-ink-soft" />
            <input type="date" required dir="ltr" value={date} min={min} max={addDays(planned, 13)} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="תאריך" className={field} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Icon name="timer" className="size-4 text-ink-soft" />
            <input type="time" required step={300} dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} aria-label="שעת התחלה" className={field} />
            <span className="text-ink-soft">
              עד <bdi dir="ltr">{end}</bdi>
            </span>
          </div>
          <fieldset>
            <legend className="mb-2 text-ink-soft">אורך</legend>
            <div className="flex flex-wrap items-center gap-1.5">
              {LENGTHS.map((m) => (
                <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)} className="chip text-sm">
                  {duration(m)}
                </button>
              ))}
              <input
                type="number"
                inputMode="numeric"
                min={15}
                max={360}
                step={5}
                value={minutes}
                onChange={(e) => setMinutes(Math.max(0, Math.min(360, Number(e.target.value) || 0)))}
                aria-label="אורך בדקות"
                className={`${field} w-20 text-center tabular-nums`}
              />
            </div>
          </fieldset>
        </div>

        {error && (
          <p className="mt-3 text-sm text-bad" role="alert">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending || minutes < 15 || !start} className="btn-primary rounded-lg px-4">
            שמירה
          </button>
          <button type="button" onClick={onClose} className="btn-ghost rounded-lg px-3">
            ביטול
          </button>
          <span className="flex-1" />
          {moved && (
            <button type="button" disabled={pending} onClick={() => go(() => setSessionMove(sessionKey, null), "המפגש חזר למקומו בתוכנית")} className="btn rounded-lg px-3">
              חזרה לתוכנית
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
