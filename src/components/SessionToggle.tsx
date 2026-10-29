"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  addStuck,
  endStudyLive,
  setSessionStatus,
  startStudyLive,
} from "@/app/act";
import { FocusMusic } from "@/components/FocusMusic";
import { FocusTasks, freeTaskKey } from "@/components/FocusTasks";
import { FocusDesktop, useWide, type FocusClock } from "@/components/FocusDesktop";
import { FocusReader, useFocusDoc } from "@/components/FocusReader";
import { assignmentOf } from "@/lib/agenda";
import { pace, readHistory, recordFocus, wrapUp } from "@/lib/focusStats";
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
  book,
  assignment,
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
  /** a chapter to read in the timer; without it, what the course's plan says to read next */
  book?: { bookId: string; idx: number } | null;
  /** an assignment's sheet to work from ("12"); an assignment session finds its own */
  assignment?: string | null;
}) {
  // a planned assignment session ("…|assignment|20109|a12-2") opens that assignment's sheet
  const [, kind, , ref] = (taskKey ?? "").split("|");
  const sessionAssignment = kind === "assignment" ? assignmentOf(ref) : null;
  const { doc: fb } = useFocusDoc(courseCode ?? null, { book, assignment: assignment ?? sessionAssignment, preferAssignment: kind === "assignment" });
  const [reading, setReading] = useState(!!book || !!assignment);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
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
  // the task list's progress, and the after-session summary (minutes studied) once "סיימתי" is pressed
  const [counts, setCounts] = useState({ done: 0, total: 0, open: 0 });
  const [wrap, setWrap] = useState<number | null>(null);

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
  // counts down; once the planned time is over it counts the extra time up ("+03:12")
  const shown = over ? elapsed - total : left;
  const mm = String(Math.floor(shown / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((shown % 60_000) / 1000)).padStart(2, "0");
  const clock = `${over ? "+" : ""}${mm}:${ss}`;
  const studied = Math.max(1, Math.round(elapsed / 60_000));
  const pct = Math.min(1, elapsed / total);
  const wide = useWide();

  // the tab shows the time, so it's in sight from the PDF or notebook in the next tab
  useEffect(() => {
    const before = document.title;
    return () => {
      document.title = before;
    };
  }, []);
  useEffect(() => {
    if (wrap == null) document.title = `${clock} · ${state.since || over ? title : "מושהה"}`;
  }, [clock, title, state.since, over, wrap]);

  const toggle = () =>
    setState((s) =>
      s.since
        ? { acc: s.acc + Date.now() - s.since, since: null }
        : { acc: s.acc, since: Date.now() },
    );
  const finish = () => {
    clear();
    const s = Math.min(studied, minutes + 60);
    recordFocus({ date: new Date().toISOString().slice(0, 10), course: courseCode ?? null, minutes: s, planned: minutes, done: counts.done, total: counts.total });
    setWrap(s);
  };
  const cancel = () => {
    clear();
    onClose();
  };

  if (wrap != null)
    return createPortal(
      <FocusWrap
        summary={wrapUp({ studied: wrap, planned: minutes, done: counts.done, total: counts.total, open: counts.open, rate: pace(readHistory(), courseCode ?? null) })}
        onClose={() => onFinish(wrap)}
      />,
      document.body,
    );

  if (wide) {
    const c: FocusClock = {
      title,
      withName,
      clock,
      over,
      running: !!state.since,
      pct,
      minutes,
      studied,
      endsAt: state.since && !over ? new Date(now + left).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : null,
      onToggle: toggle,
      onFinish: finish,
      onCancel: cancel,
    };
    return createPortal(
      <FocusDesktop
        c={c}
        courseCode={courseCode ?? null}
        taskKey={taskKey ?? freeTaskKey(courseCode)}
        onCounts={setCounts}
        stuck={<Stuck inline courseCode={courseCode ?? null} title={title} />}
        doc={fb}
        reading={reading}
        onReading={setReading}
      />,
      document.body,
    );
  }

  // Phone: the book takes the screen under a slim timer bar. The timer view stays mounted (hidden)
  // so the music and the task list carry on.
  const inBook = reading && !!fb;
  return createPortal(
    <div
      className={`fixed inset-0 z-50 bg-surface ${inBook ? "flex flex-col" : "overflow-y-auto"}`}
      role="dialog"
      aria-modal
      aria-label="טיימר ריכוז"
    >
      {inBook && fb && (
        <>
          <div className="flex shrink-0 items-center gap-2 border-b border-rule px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <button type="button" onClick={() => setReading(false)} className="inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm text-ink-soft">
              <Icon name="chevronRight" className="size-4" />
              טיימר
            </button>
            <span className={`ms-auto font-display text-2xl tabular-nums ${state.since || over ? "" : "text-ink-soft"}`} dir="ltr">
              {clock}
            </span>
            {!over && (
              <button type="button" onClick={toggle} className="grid size-11 place-items-center rounded-full border border-rule" aria-label={state.since ? "השהיה" : "המשך"}>
                <Icon name={state.since ? "pause" : "play"} className="size-4" />
              </button>
            )}
            <button type="button" onClick={finish} className="min-h-11 rounded-full bg-ink px-4 text-sm font-medium text-bg">
              סיימתי
            </button>
          </div>
          <div ref={setScrollEl} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-bg">
            <FocusReader key={fb.key} doc={fb} scrollRoot={scrollEl} wide={false} />
          </div>
        </>
      )}
      <div className={`min-h-full flex-col items-center justify-center gap-10 px-6 py-8 ${inBook ? "hidden" : "flex"}`}>
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
              {clock}
            </span>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3 sm:mt-8">
            {!over && (
              <button
                type="button"
                onClick={toggle}
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
              onClick={finish}
              className="rounded-full bg-ink px-5 py-2.5 font-medium text-bg"
            >
              סיימתי ({studied} דק׳)
            </button>
            <button
              type="button"
              onClick={cancel}
              className="rounded-full px-4 py-2.5 text-ink-soft hover:text-ink"
            >
              ביטול
            </button>
          </div>
          {fb && (
            <button type="button" onClick={() => setReading(true)} className="mt-5 flex w-full max-w-sm items-center gap-3 rounded-2xl border border-rule px-4 py-3 text-start">
              <Icon name={fb.cta.icon} className="size-5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{fb.cta.title}</span>
                <span className="block truncate text-sm text-ink-soft">{fb.cta.sub}</span>
              </span>
              <Icon name="chevronLeft" className="size-4 shrink-0 text-ink-soft" />
            </button>
          )}
          <Stuck courseCode={courseCode ?? null} title={title} />
          <FocusMusic running={!!state.since && !over} over={over} />
        </div>
        <FocusTasks
          taskKey={taskKey ?? freeTaskKey(courseCode)}
          courseCode={courseCode ?? null}
          minutes={minutes}
          title={title}
          onCounts={setCounts}
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
  inline = false,
}: {
  courseCode: string | null;
  title: string;
  /** always open, with a heading (the desktop side panel) */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(0);
  const [pending, start] = useTransition();
  const placeholder = `על מה נתקעת ב${title.replace(/^(הכנה ל|חזרה ל|לימוד שוטף ב)/, "")}?`;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    start(async () => {
      await addStuck({ topic: text, course_code: courseCode }).catch(() => {});
      setSaved((n) => n + 1);
      setText("");
      setOpen(false);
    });
  };
  if (inline)
    return (
      <section aria-labelledby="focus-stuck-h">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="focus-stuck-h" className="font-medium">
            נתקעתי
          </h3>
          {saved > 0 && (
            <span className="text-sm text-ink-soft" aria-live="polite">
              {saved === 1 ? "נשמר" : `${saved} נשמרו`}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-ink-soft">כותבים בשורה אחת וממשיכים. זה יחכה בכרטיס הקורס.</p>
        <form className="mt-2 flex gap-2" onSubmit={submit}>
          <label htmlFor="focus-stuck" className="sr-only">
            על מה נתקעת
          </label>
          <input
            id="focus-stuck"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
            maxLength={300}
            placeholder={placeholder}
            className="min-w-0 flex-1 rounded-lg border border-rule-strong bg-bg px-3 py-2 text-sm"
          />
          <button disabled={pending || !text.trim()} className="btn rounded-lg px-3 text-sm">
            שמירה
          </button>
        </form>
      </section>
    );
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
    <form className="mt-4 flex w-full max-w-sm gap-2" onSubmit={submit}>
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={300}
        placeholder={placeholder}
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

/** A few seconds after "סיימתי": what got done, what moves on, and a length to aim for next time. */
function FocusWrap({ summary, onClose }: { summary: { headline: string; lines: string[] }; onClose: () => void }) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    navigator.vibrate?.(40);
    const t = setTimeout(() => close.current(), 7000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-surface px-6 text-center" role="dialog" aria-modal aria-label="סיכום זמן הריכוז">
      <div className="max-w-sm">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-ink text-bg">
          <Icon name="check" className="size-7" />
        </span>
        <p className="mt-5 font-display text-3xl">{summary.headline}</p>
        {summary.lines.map((l, i) => (
          <p key={i} className="mt-3 leading-relaxed text-ink-soft">
            {l}
          </p>
        ))}
        <button type="button" onClick={() => close.current()} className="btn mt-6 rounded-full px-6">
          סגירה
        </button>
      </div>
    </div>
  );
}
