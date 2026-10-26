"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FocusMusic } from "@/components/FocusMusic";
import { FocusTasks } from "@/components/FocusTasks";
import { Icon } from "@/components/Icon";

/** What the timer knows, shared by the phone layout, this one and the floating window. */
export interface FocusClock {
  title: string;
  /** "לומדים ביחד עם…" when joining a friend */
  withName?: string;
  /** "23:41", or "+03:12" once the planned time is over */
  clock: string;
  over: boolean;
  running: boolean;
  /** 0–1 of the planned time */
  pct: number;
  minutes: number;
  studied: number;
  /** "10:25" when running, null while paused */
  endsAt: string | null;
  onToggle: () => void;
  onFinish: () => void;
  onCancel: () => void;
}

/** Wide screens (a computer, an iPad on its side): the timer gets a real page, not a phone column. */
export function useWide() {
  const q = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * The focus page on a computer: a header with the session and its window controls, the timer on
 * the main stage, and a side panel with the session's tasks, "I'm stuck" and music. Keyboard:
 * space pauses, N adds a task, S notes where you're stuck, F goes full screen, P opens the floating
 * window (keys go by position, so they work with the Hebrew layout too).
 */
export function FocusDesktop({
  c,
  courseCode,
  taskKey,
  onCounts,
  stuck,
}: {
  c: FocusClock;
  courseCode: string | null;
  taskKey: string;
  onCounts: (x: { done: number; total: number; open: number }) => void;
  /** the "I'm stuck" box (it saves through the timer's own action) */
  stuck: React.ReactNode;
}) {
  const [full, setFull] = useState(false);
  const pip = useFloatingWindow(c.title);
  const live = useRef(c);
  useEffect(() => {
    live.current = c;
  });

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const go = (f: () => void) => {
        e.preventDefault();
        f();
      };
      if (e.code === "Space" && !live.current.over) go(live.current.onToggle);
      else if (e.code === "KeyN") go(() => document.getElementById("focus-task")?.focus());
      else if (e.code === "KeyS") go(() => document.getElementById("focus-stuck")?.focus());
      else if (e.code === "KeyF") go(toggleFull);
      else if (e.code === "KeyP" && pip.supported) go(pip.toggle);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [pip.supported, pip.toggle]);

  const R = 46;
  const ring = 2 * Math.PI * R;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal aria-label="זמן ריכוז">
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-rule bg-surface px-8">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-soft">{c.withName ? `לומדים ביחד עם ${c.withName}` : "זמן ריכוז"}</p>
          <h2 className="truncate font-semibold">{c.title}</h2>
        </div>
        {pip.supported && (
          <button type="button" onClick={pip.toggle} className="btn-ghost rounded-lg px-3 text-sm" aria-pressed={pip.open}>
            <Icon name="pip" className="size-4" />
            {pip.open ? "סגירת החלון הצף" : "חלון צף"}
          </button>
        )}
        <button type="button" onClick={toggleFull} className="btn-ghost rounded-lg px-3 text-sm">
          <Icon name={full ? "shrink" : "expand"} className="size-4" />
          {full ? "יציאה ממסך מלא" : "מסך מלא"}
        </button>
        <button type="button" onClick={c.onCancel} className="btn-ghost rounded-lg px-3 text-sm text-ink-soft">
          <Icon name="close" className="size-4" />
          ביטול
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)]">
        <main className="flex min-h-0 flex-col items-center justify-center overflow-y-auto px-10 py-8">
          <p className={`text-lg ${c.over ? "font-semibold" : "text-ink-soft"}`} aria-live="polite">
            {c.over ? "הזמן שתכננת נגמר. כל הכבוד!" : c.running ? "לומדים" : "מושהה"}
          </p>
          <div className="relative mt-6 grid aspect-square w-[min(28rem,52vh)] place-items-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r={R} fill="none" stroke="var(--rule)" strokeWidth="2.5" />
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke="var(--ink)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={ring}
                strokeDashoffset={ring * (1 - c.pct)}
                className="transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
              />
            </svg>
            <div className="text-center">
              <span className={`block font-display text-[clamp(4.5rem,11vh,7.5rem)] leading-none tabular-nums ${c.running || c.over ? "" : "text-ink-soft"}`} dir="ltr">
                {c.clock}
              </span>
              <span className="mt-3 block text-ink-soft">
                {c.over ? `תכננת ${c.minutes} דק׳, למדת ${c.studied}` : c.endsAt ? `מסתיים ב־${c.endsAt}` : `${c.minutes} דק׳ מתוכננות`}
              </span>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-3">
            {!c.over && (
              <button type="button" onClick={c.onToggle} className="inline-flex min-w-36 items-center justify-center rounded-full border border-rule-strong px-6 py-3 text-lg hover:border-ink">
                <Icon name={c.running ? "pause" : "play"} className="me-2 size-4" />
                {c.running ? "השהיה" : "המשך"}
              </button>
            )}
            <button type="button" onClick={c.onFinish} className="rounded-full bg-ink px-7 py-3 text-lg font-medium text-bg">
              סיימתי ({c.studied} דק׳)
            </button>
          </div>

          <dl className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-ink-soft" aria-label="קיצורי מקלדת">
            {!c.over && <Shortcut k="רווח" label={c.running ? "השהיה" : "המשך"} />}
            <Shortcut k="N" label="משימה חדשה" />
            <Shortcut k="S" label="נתקעתי" />
            <Shortcut k="F" label="מסך מלא" />
            {pip.supported && <Shortcut k="P" label="חלון צף" />}
          </dl>
        </main>

        <aside className="flex min-h-0 flex-col gap-8 overflow-y-auto border-s border-rule bg-surface px-7 py-7">
          <FocusTasks taskKey={taskKey} courseCode={courseCode} minutes={c.minutes} title={c.title} onCounts={onCounts} className="w-full" />
          {stuck}
          <div className="mt-auto border-t border-rule pt-6">
            <h3 className="mb-3 font-medium">מוזיקה</h3>
            <FocusMusic running={c.running && !c.over} over={c.over} className="w-full" />
          </div>
          <p className="text-xs text-ink-soft">הזמן שלמדת נספר לטובת המטלה. מה שנשאר יתוזמן מחדש בימים הבאים.</p>
        </aside>
      </div>

      {pip.win && createPortal(<MiniTimer c={c} />, pip.win.document.body)}
    </div>
  );
}

function Shortcut({ k, label }: { k: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <dt>
        <kbd className="inline-grid min-w-7 place-items-center rounded-md border border-rule-strong bg-surface px-1.5 py-0.5 font-sans text-xs text-ink" dir="ltr">
          {k}
        </kbd>
      </dt>
      <dd>{label}</dd>
    </div>
  );
}

/** The floating window: just the time and two buttons, above the PDF or the notebook you study from. */
function MiniTimer({ c }: { c: FocusClock }) {
  return (
    <div className="flex h-dvh flex-col justify-between bg-surface p-4 text-ink" dir="rtl" lang="he">
      <p className="truncate text-sm text-ink-soft">{c.over ? "הזמן נגמר" : c.running ? c.title : "מושהה"}</p>
      <div>
        <span className={`block text-center font-display text-6xl leading-none tabular-nums ${c.running || c.over ? "" : "text-ink-soft"}`} dir="ltr">
          {c.clock}
        </span>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-rule" aria-hidden>
          <div className="h-full rounded-full bg-ink" style={{ width: `${c.pct * 100}%` }} />
        </div>
      </div>
      <div className="flex gap-2">
        {!c.over && (
          <button type="button" onClick={c.onToggle} className="flex-1 rounded-full border border-rule-strong py-2 text-sm">
            {c.running ? "השהיה" : "המשך"}
          </button>
        )}
        <button type="button" onClick={c.onFinish} className="flex-1 rounded-full bg-ink py-2 text-sm font-medium text-bg">
          סיימתי
        </button>
      </div>
    </div>
  );
}

interface PipApi {
  window: Window | null;
  requestWindow: (o?: { width?: number; height?: number }) => Promise<Window>;
}

/**
 * Document Picture-in-Picture (Chrome and Edge on a computer): a small always-on-top window that
 * keeps the timer in sight while you work in another app. Elsewhere the button isn't shown.
 */
function useFloatingWindow(title: string) {
  const [win, setWin] = useState<Window | null>(null);
  const [supported] = useState(() => typeof window !== "undefined" && "documentPictureInPicture" in window);
  const name = useRef(title);
  useEffect(() => {
    name.current = title;
  }, [title]);

  const toggle = useCallback(async () => {
    const p = pipApi();
    if (!p) return;
    if (p.window) return p.window.close();
    try {
      const w = await p.requestWindow({ width: 300, height: 220 });
      // the same styles and theme as the page
      for (const n of document.querySelectorAll('link[rel="stylesheet"], style')) w.document.head.append(n.cloneNode(true));
      const html = w.document.documentElement;
      html.className = document.documentElement.className;
      for (const a of document.documentElement.getAttributeNames()) if (a.startsWith("data-")) html.setAttribute(a, document.documentElement.getAttribute(a)!);
      html.dir = "rtl";
      html.lang = "he";
      w.document.title = name.current;
      w.addEventListener("pagehide", () => setWin(null));
      setWin(w);
    } catch {}
  }, []);

  // close it with the timer
  useEffect(() => () => pipApi()?.window?.close(), []);
  return { supported, open: !!win, win, toggle };
}

const pipApi = () => (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture;
