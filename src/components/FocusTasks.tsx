"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addFocusTask, deleteFocusTask, getFocusTasks, pullFocusTask, setFocusTaskDone, setSessionStep } from "@/app/act";
import type { FocusTask } from "@/app/focusActions";
import { Icon } from "@/components/Icon";
import type { AgendaStep } from "@/lib/agenda";

/** The same store the Today agenda uses, so a tick here shows there at once. */
const AGENDA_EVENT = "agenda-change";
const readLocal = (k: string): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? "{}");
  } catch {
    return {};
  }
};

/** "free|2026-10-25|20109": the key of a timer that isn't a planned session. */
export function freeTaskKey(courseCode: string | null | undefined) {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  return `free|${d}|${courseCode ?? "none"}`;
}

type Row = Pick<FocusTask, "id" | "text" | "done"> & { pending?: boolean };

/**
 * The to-do list inside the focus timer: the session's plan steps, my own tasks for this sitting,
 * and what I didn't finish last time in this course. Undone tasks wait for the next session.
 */
export function FocusTasks({
  taskKey,
  courseCode,
  minutes,
  title,
  onCounts,
}: {
  taskKey: string;
  courseCode: string | null;
  minutes: number;
  title: string;
  /** progress for the after-session summary */
  onCounts?: (c: { done: number; total: number; open: number }) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [steps, setSteps] = useState<AgendaStep[]>([]);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [tasks, setTasks] = useState<Row[]>([]);
  const [carried, setCarried] = useState<Row[]>([]);
  const [text, setText] = useState("");
  const [showCarried, setShowCarried] = useState(false);
  const [, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const localKey = `focus:tasks:${taskKey}`;
  const agendaKey = `agenda:${taskKey}`;

  useEffect(() => {
    let alive = true;
    getFocusTasks({ taskKey, courseCode, minutes, title })
      .then((r) => {
        if (!alive) return;
        const local = readLocal(agendaKey);
        setSteps(r.agenda.steps);
        setTicks(Object.fromEntries(r.agenda.steps.map((s) => [s.id, local[s.id] ?? r.agenda.done.includes(s.id)])));
        setTasks(r.tasks);
        setCarried(r.carried);
      })
      .catch(() => {
        // demo mode or no connection: a list kept in this browser
        if (!alive) return;
        setOffline(true);
        try {
          setTasks(JSON.parse(localStorage.getItem(localKey) ?? "[]"));
        } catch {}
      })
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [taskKey, courseCode, minutes, title, agendaKey, localKey]);

  // offline copy
  useEffect(() => {
    if (!offline) return;
    try {
      localStorage.setItem(localKey, JSON.stringify(tasks));
    } catch {}
  }, [offline, tasks, localKey]);

  const tickStep = (id: string) => {
    const on = !ticks[id];
    setTicks((t) => ({ ...t, [id]: on }));
    try {
      localStorage.setItem(agendaKey, JSON.stringify({ ...readLocal(agendaKey), [id]: on }));
    } catch {}
    window.dispatchEvent(new Event(AGENDA_EVENT));
    if (on) navigator.vibrate?.(15);
    start(async () => void (await setSessionStep(taskKey, id, on).catch(() => {})));
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    const temp: Row = { id: `tmp-${Date.now()}`, text: t, done: false, pending: true };
    setTasks((xs) => [...xs, temp]);
    input.current?.focus();
    if (offline) return setTasks((xs) => xs.map((x) => (x.id === temp.id ? { ...x, pending: false } : x)));
    start(async () => {
      try {
        const saved = await addFocusTask({ taskKey, courseCode, text: t, position: tasks.length });
        setTasks((xs) => xs.map((x) => (x.id === temp.id ? saved : x)));
      } catch {
        setTasks((xs) => xs.filter((x) => x.id !== temp.id));
        setText(t);
      }
    });
  };

  const toggle = (row: Row) => {
    const done = !row.done;
    setTasks((xs) => xs.map((x) => (x.id === row.id ? { ...x, done } : x)));
    if (done) navigator.vibrate?.(15);
    if (!offline && !row.id.startsWith("tmp-")) start(async () => void (await setFocusTaskDone(row.id, done).catch(() => {})));
  };

  const remove = (row: Row) => {
    setTasks((xs) => xs.filter((x) => x.id !== row.id));
    if (!offline && !row.id.startsWith("tmp-")) start(async () => void (await deleteFocusTask(row.id).catch(() => {})));
  };

  const pull = (row: Row) => {
    setCarried((xs) => xs.filter((x) => x.id !== row.id));
    setTasks((xs) => [...xs, row]);
    start(async () => void (await pullFocusTask(row.id, taskKey).catch(() => {})));
  };

  const all = steps.length + tasks.length;
  const done = steps.filter((s) => ticks[s.id]).length + tasks.filter((t) => t.done).length;
  const open = tasks.filter((t) => !t.done).length;
  useEffect(() => {
    onCounts?.({ done, total: all, open });
  }, [onCounts, done, all, open]);

  return (
    <section className="w-full max-w-sm text-start" aria-label="משימות לזמן הזה">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-medium">מה עושים בזמן הזה</h3>
        {all > 0 && (
          <span className="text-sm tabular-nums text-ink-soft" aria-live="polite">
            {done} מתוך {all}
          </span>
        )}
      </div>
      {all > 0 && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-rule" aria-hidden>
          <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${(done / all) * 100}%` }} />
        </div>
      )}

      {!loaded ? (
        <div className="mt-3 h-24 animate-pulse rounded-xl bg-rule/50" aria-hidden />
      ) : (
        <ul className="mt-3 space-y-1">
          {steps.map((s) => (
            <TaskRow key={s.id} text={s.text} done={!!ticks[s.id]} onToggle={() => tickStep(s.id)} hint="מהתוכנית" />
          ))}
          {tasks.map((t) => (
            <TaskRow key={t.id} text={t.text} done={t.done} onToggle={() => toggle(t)} onRemove={() => remove(t)} faded={t.pending} />
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-2 flex gap-2">
        <label htmlFor="focus-task" className="sr-only">
          משימה חדשה
        </label>
        <input
          id="focus-task"
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder={all ? "עוד משימה" : "למשל: שאלה 3 בממ״ן, לחזור על ההוכחה"}
          className="min-w-0 flex-1 rounded-lg border border-rule-strong bg-bg px-3 py-2 text-sm"
        />
        <button type="submit" disabled={!text.trim()} className="btn rounded-lg px-3" aria-label="הוספה">
          <Icon name="plus" className="size-4" />
        </button>
      </form>

      {carried.length > 0 && (
        <div className="mt-3 text-sm">
          <button type="button" onClick={() => setShowCarried(!showCarried)} aria-expanded={showCarried} className="text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
            {carried.length === 1 ? "משימה אחת נשארה" : `${carried.length} משימות נשארו`} מהפעם הקודמת
          </button>
          {showCarried && (
            <ul className="mt-2 space-y-1">
              {carried.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-ink-soft">{c.text}</span>
                  <button type="button" onClick={() => pull(c)} className="btn-ghost shrink-0 rounded-lg px-2 text-sm">
                    <Icon name="plus" className="size-3.5" />
                    להוסיף
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {tasks.some((t) => !t.done) && <p className="mt-3 text-xs text-ink-soft">מה שלא יסומן יחכה למפגש הבא בקורס הזה.</p>}
    </section>
  );
}

function TaskRow({ text, done, onToggle, onRemove, hint, faded }: { text: string; done: boolean; onToggle: () => void; onRemove?: () => void; hint?: string; faded?: boolean }) {
  return (
    <li className={`group flex items-start gap-2.5 rounded-lg px-1 py-1.5 ${faded ? "opacity-60" : ""}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={text}
        onClick={onToggle}
        className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border transition-colors ${done ? "border-ink bg-ink text-bg" : "border-rule-strong hover:border-ink"}`}
      >
        {done && <Icon name="check" className="size-4" />}
      </button>
      <span className={`min-w-0 flex-1 text-sm leading-6 ${done ? "text-ink-soft line-through" : ""}`}>
        {text}
        {hint && <span className="ms-2 text-xs text-ink-soft no-underline">{hint}</span>}
      </span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`מחיקה: ${text}`} className="grid size-7 shrink-0 place-items-center rounded-md text-ink-soft opacity-60 hover:bg-bg hover:opacity-100 [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100">
          <Icon name="close" className="size-3.5" />
        </button>
      )}
    </li>
  );
}
