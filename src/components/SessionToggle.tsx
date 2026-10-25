"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  addStuck,
  endStudyLive,
  setSessionStatus,
  startStudyLive,
} from "@/app/act";
import { FocusMusic } from "@/components/FocusMusic";
import { FocusTasks, freeTaskKey } from "@/components/FocusTasks";
import { Icon } from "@/components/Icon";

export function SessionToggle({
  sessionKey,
  status,
  minutes,
  title,
  hero = false,
  courseCode,
  past = false,
}: {
  /** the session's time has passed: ask "done or skipped?" (no timer) */
  past?: boolean;
  sessionKey: string;
  status?: "done" | "skipped";
  minutes: number;
  title: string;
  /** big "start now" button, for the Up next card */
  hero?: boolean;
  courseCode?: string;
}) {
  const [current, set] = useOptimistic(
    status ?? null,
    (_s, next: "done" | "skipped" | null) => next,
  );
  const [, start] = useTransition();
  const [timer, setTimer] = useState(false);
  const save = (next: "done" | "skipped" | null, studied = minutes) =>
    start(async () => {
      set(next);
      await setSessionStatus(sessionKey, next, studied);
    });

  if (current)
    return (
      <button
        type="button"
        onClick={() => save(null)}
        className="btn shrink-0 text-ink-soft"
        aria-label={`${current === "done" ? "בוצע" : "דולג"}. לביטול הסימון`}
      >
        {current === "done" ? <Icon name="check" className="size-4" /> : null}
        {current === "done" ? "בוצע" : "דולג"}
      </button>
    );
  const timerEl = timer && (
    <FocusTimer
      storageKey={`timer:${sessionKey}`}
      taskKey={sessionKey}
      title={title}
      minutes={minutes}
      courseCode={courseCode}
      onClose={() => setTimer(false)}
      onFinish={(studied) => {
        setTimer(false);
        save("done", studied);
      }}
    />
  );
  if (hero)
    return (
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTimer(true)}
          className="inline-flex min-h-11 items-center rounded-full bg-on-accent px-5 py-2.5 font-semibold text-accent"
        >
          <Icon name="play" className="me-1.5 size-4" />
          להתחיל עכשיו
        </button>
        <button
          type="button"
          onClick={() => save("done")}
          className="min-h-11 rounded-full border border-on-accent/40 px-4 py-2.5 text-sm"
        >
          כבר עשיתי
        </button>
        {timerEl}
      </span>
    );
  if (past)
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <button type="button" onClick={() => save("done")} className="btn">
          <Icon name="check" className="size-4" />
          בוצע
        </button>
        <button
          type="button"
          onClick={() => save("skipped")}
          className="btn-ghost"
        >
          דולג
        </button>
      </span>
    );
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => setTimer(true)}
        className="grid size-9 place-items-center rounded-full border border-rule-strong text-ink-soft hover:border-ink hover:text-ink [@media(pointer:coarse)]:size-11"
        aria-label="טיימר ריכוז"
        title="טיימר ריכוז"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M7 4.5v15l12-7.5z" />
        </svg>
      </button>
      <button type="button" onClick={() => save("done")} className="btn">
        בוצע
      </button>
      <button
        type="button"
        onClick={() => save("skipped")}
        className="btn-ghost hidden px-2 sm:inline-flex"
      >
        דילוג
      </button>
      {timerEl}
    </span>
  );
}

/**
 * Full-screen countdown for one study session. Survives a reload (start time kept in this browser).
 * While it runs, friends who follow you see "studying now" and can join.
 */
export function FocusTimer({
  storageKey,
  title,
  minutes,
  onClose,
  onFinish,
  withUser,
  withName,
  courseCode,
  taskKey,
}: {
  storageKey: string;
  title: string;
  minutes: number;
  onClose: () => void;
  onFinish: (studied: number) => void;
  /** joining a friend's session */
  withUser?: string;
  withName?: string;
  /** for "I'm stuck" notes */
  courseCode?: string | null;
  /** the to-do list's key: a planned session's key, else a free timer of today in this course */
  taskKey?: string;
}) {
  useEffect(() => {
    startStudyLive({ title, minutes, with_user: withUser ?? null }).catch(
      () => {},
    );
    return () => {
      endStudyLive().catch(() => {});
    };
  }, [title, minutes, withUser]);
  // elapsed ms accumulated before the current run, and when the current run started (null = paused)
  const [state, setState] = useState<{ acc: number; since: number | null }>(
    () => {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
        if (saved && typeof saved.acc === "number") return saved;
      } catch {}
      return { acc: 0, since: Date.now() };
    },
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {}
  }, [state, storageKey]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = state.acc + (state.since ? now - state.since : 0);
  const total = minutes * 60_000;
  const left = Math.max(0, total - elapsed);
  const over = elapsed >= total;

  useEffect(() => {
    if (!over) return;
    try {
      navigator.vibrate?.(300);
    } catch {}
  }, [over]);

  const clear = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  };
  const mm = String(Math.floor(left / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, "0");
  const studied = Math.max(1, Math.round(elapsed / 60_000));
  const pct = Math.min(1, elapsed / total);

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-surface"
      role="dialog"
      aria-modal
      aria-label="טיימר ריכוז"
    >
      <div className="flex min-h-full flex-col items-center justify-center gap-10 px-6 py-8 lg:flex-row lg:items-start lg:justify-center lg:gap-20 lg:pt-[12vh]">
        <div className="flex flex-col items-center text-center">
          <p className="text-sm text-ink-soft">
            {over
              ? "הזמן נגמר. כל הכבוד!"
              : withName
                ? `לומדים ביחד עם ${withName}`
                : "זמן ריכוז"}
          </p>
          <h2 className="mt-1 text-xl font-semibold">{title}</h2>
          <div className="relative mt-6 grid size-52 place-items-center sm:mt-8 sm:size-64">
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-0 -rotate-90"
              aria-hidden
            >
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="var(--rule)"
                strokeWidth="4"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="var(--ink)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 45}
                strokeDashoffset={2 * Math.PI * 45 * (1 - pct)}
              />
            </svg>
            <span className="font-display text-5xl tabular-nums sm:text-6xl" dir="ltr">
              {mm}:{ss}
            </span>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3 sm:mt-8">
            {!over && (
              <button
                type="button"
                onClick={() =>
                  setState((s) =>
                    s.since
                      ? { acc: s.acc + Date.now() - s.since, since: null }
                      : { acc: s.acc, since: Date.now() },
                  )
                }
                className="inline-flex items-center rounded-full border border-rule px-5 py-2.5 hover:border-ink"
              >
                <Icon
                  name={state.since ? "pause" : "play"}
                  className="me-1.5 size-4"
                />
                {state.since ? "השהיה" : "המשך"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                clear();
                onFinish(Math.min(studied, minutes + 60));
              }}
              className="rounded-full bg-ink px-5 py-2.5 font-medium text-bg"
            >
              סיימתי ({studied} דק׳)
            </button>
            <button
              type="button"
              onClick={() => {
                clear();
                onClose();
              }}
              className="rounded-full px-4 py-2.5 text-ink-soft hover:text-ink"
            >
              ביטול
            </button>
          </div>
          <Stuck courseCode={courseCode ?? null} title={title} />
          <FocusMusic running={!!state.since && !over} over={over} />
          <p className="mt-6 hidden max-w-xs text-xs text-ink-soft lg:block">
            הזמן שלמדת נספר לטובת המטלה. מה שנשאר יתוזמן מחדש בימים הבאים.
          </p>
        </div>
        <FocusTasks
          taskKey={taskKey ?? freeTaskKey(courseCode)}
          courseCode={courseCode ?? null}
          minutes={minutes}
          title={title}
        />
      </div>
    </div>,
    document.body,
  );
}

/** "I'm stuck": jot down what's blocking you without leaving the timer; it waits on the course card. */
function Stuck({
  courseCode,
  title,
}: {
  courseCode: string | null;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(0);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 text-sm text-ink-soft underline underline-offset-4 decoration-rule"
      >
        <Icon name="help" className="me-1 size-4" />
        נתקעתי{saved ? ` (${saved} נשמרו)` : ""}
      </button>
    );
  return (
    <form
      className="mt-4 flex w-full max-w-sm gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        start(async () => {
          await addStuck({ topic: text, course_code: courseCode }).catch(
            () => {},
          );
          setSaved((n) => n + 1);
          setText("");
          setOpen(false);
        });
      }}
    >
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={300}
        placeholder={`על מה נתקעת ב${title.replace(/^(הכנה ל|חזרה ל|לימוד שוטף ב)/, "")}?`}
        className="min-w-0 flex-1 rounded-lg border border-rule bg-bg px-3 py-2 text-sm"
      />
      <button
        disabled={pending}
        className="rounded-lg bg-ink px-3 text-sm text-bg"
      >
        שמירה
      </button>
    </form>
  );
}
