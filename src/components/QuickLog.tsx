"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { logStudy } from "@/app/act";
import { FocusTimer } from "@/components/SessionToggle";
import { Icon } from "@/components/Icon";

const KEY = "quicklog:last";
const DURATIONS = [25, 45, 60, 90];

/**
 * Log study from anywhere in three taps: a floating button opens a sheet with course chips and
 * durations. "Start a timer" runs the focus timer instead and logs what you actually studied.
 * Home-screen shortcuts open it with /?log=1 (log) or /?focus=1 (timer).
 */
export function QuickLog({ courses }: { courses: { code: string; short: string; color: string }[] }) {
  const [open, setOpen] = useState(false);
  const [course, setCourse] = useState<string | null>(courses[0]?.code ?? null);
  const [minutes, setMinutes] = useState(45);
  const [custom, setCustom] = useState("");
  const [timer, setTimer] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    try {
      const last = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (last?.course && courses.some((c) => c.code === last.course)) setCourse(last.course);
      if (last?.minutes) setMinutes(last.minutes);
    } catch {}
    const q = new URLSearchParams(location.search);
    if (q.get("log")) setOpen(true);
    if (Number(q.get("min")) > 0) setMinutes(Math.min(180, Number(q.get("min")))); // ?focus=1&min=15 (if-then pushes)
    if (q.get("focus")) setTimer(true);
  }, [courses]);

  const save = (m: number) =>
    start(async () => {
      try {
        const n = await logStudy({ course_code: course, minutes: m });
        try {
          localStorage.setItem(KEY, JSON.stringify({ course, minutes: m }));
        } catch {}
        navigator.vibrate?.(30);
        setMsg(`נרשמו ${n} דקות${course ? ` ב${courses.find((c) => c.code === course)?.short ?? ""}` : ""} ✓`);
        setTimeout(() => {
          setOpen(false);
          setMsg(null);
        }, 1200);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "לא נשמר");
      }
    });

  const chip = (on: boolean) => `rounded-full border px-3.5 py-2 text-sm ${on ? "border-accent bg-accent text-on-accent" : "border-rule"}`;
  const title = course ? `לימוד ב${courses.find((c) => c.code === course)?.short ?? ""}` : "לימוד";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="רישום לימוד"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.6rem+var(--player-h,0px))] end-4 z-30 grid size-14 place-items-center rounded-full bg-ink text-bg shadow-lg md:bottom-[calc(1.5rem+var(--player-h,0px))] md:end-6"
      >
        <Icon name="timer" className="size-6" />
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setOpen(false)} role="presentation">
            <div
              role="dialog"
              aria-modal
              aria-label="רישום לימוד"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
              className="w-full max-w-md rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-rule sm:hidden" aria-hidden />
              <h2 className="section-title">כמה למדת?</h2>
              {courses.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {courses.map((c) => (
                    <button key={c.code} type="button" onClick={() => setCourse(c.code)} className={chip(course === c.code)}>
                      <span className="me-1.5 inline-block size-2 rounded-full" style={{ background: c.color }} aria-hidden />
                      {c.short}
                    </button>
                  ))}
                  <button type="button" onClick={() => setCourse(null)} className={chip(course === null)}>
                    אחר
                  </button>
                </div>
              )}
              <div className="mt-4 grid grid-cols-4 gap-2">
                {DURATIONS.map((m) => (
                  <button key={m} type="button" disabled={pending} onClick={() => save(m)} className={`rounded-xl border py-3 text-center ${minutes === m ? "border-ink" : "border-rule"} hover:border-ink`}>
                    <span className="block text-lg font-semibold tabular-nums">{m}</span>
                    <span className="text-xs text-ink-soft">דק׳</span>
                  </button>
                ))}
              </div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (Number(custom) > 0) save(Number(custom));
                }}
              >
                <input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  placeholder="מספר אחר של דקות"
                  className="min-w-0 flex-1 rounded-xl border border-rule bg-bg px-3 py-2"
                  aria-label="דקות"
                />
                <button disabled={pending || !custom} className="rounded-xl border border-rule px-4 disabled:opacity-40">
                  שמירה
                </button>
              </form>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setTimer(true);
                }}
                className="mt-4 flex w-full items-center justify-center rounded-xl bg-ink py-3 font-medium text-bg"
              >
                <Icon name="play" className="me-1.5 size-4" />
                להתחיל טיימר במקום
              </button>
              {msg && (
                <p className="mt-3 text-center text-sm" aria-live="polite">
                  {msg}
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
      {timer && (
        <FocusTimer
          storageKey="timer:free"
          title={title}
          minutes={minutes}
          courseCode={course}
          onClose={() => setTimer(false)}
          onFinish={(studied) => {
            setTimer(false);
            save(studied);
          }}
        />
      )}
    </>
  );
}
