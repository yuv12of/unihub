"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { addStudyEntry, deleteStudyEntry, restoreStudyEntry, updateStudyEntry } from "@/app/act";
import { Icon } from "@/components/Icon";
import { LOG_BACK_DAYS, totals, type LogEntry } from "@/lib/studyLog";
import { duration } from "@/lib/time";

type Course = { code: string; short: string; color: string };

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayName = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" });
const short = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("he-IL", { day: "numeric", month: "numeric", timeZone: "UTC" });

export function StudyLog({
  weekStart,
  today,
  thisWeek,
  entries: initial,
  courses,
  goal,
  editable,
}: {
  weekStart: string;
  today: string;
  thisWeek: string;
  entries: LogEntry[];
  courses: Course[];
  goal: number | null;
  editable: boolean;
}) {
  const [entries, setEntries] = useState(initial);
  const [seen, setSeen] = useState(initial);
  // a new week (or a server refresh) replaces the local copy
  if (initial !== seen) {
    setSeen(initial);
    setEntries(initial);
  }
  const [undo, setUndo] = useState<LogEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const course = (code: string | null) => courses.find((c) => c.code === code) ?? { code: "other", short: "אחר", color: "var(--ink-soft)" };
  const t = totals(entries);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d) => d <= today || t.byDay[d]);

  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), 7000);
    return () => clearTimeout(id);
  }, [undo]);

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message || "לא נשמר");
      }
    });

  const remove = (e: LogEntry) => {
    setEntries((xs) => xs.filter((x) => x.key !== e.key));
    setUndo(e);
    run(async () => {
      try {
        await deleteStudyEntry(e.key);
      } catch (err) {
        setEntries((xs) => [...xs, e]);
        setUndo(null);
        throw err;
      }
    });
  };

  const restore = () => {
    const e = undo;
    if (!e) return;
    setUndo(null);
    setEntries((xs) => [...xs, e].sort((a, b) => a.key.localeCompare(b.key)));
    run(() => restoreStudyEntry(e.key, e.minutes));
  };

  const save = (e: LogEntry, patch: { minutes: number; date: string; code: string | null }) =>
    run(async () => {
      const next = await updateStudyEntry(e.key, { minutes: patch.minutes, ...(e.movable ? { date: patch.date, code: patch.code } : {}) });
      setEntries((xs) =>
        xs
          .map((x) => (x.key === e.key ? { ...x, key: next, minutes: patch.minutes, ...(e.movable ? { date: patch.date, code: patch.code } : {}) } : x))
          .filter((x) => x.date >= weekStart && x.date < addDays(weekStart, 7)),
      );
    });

  return (
    <div className="mt-6 max-w-3xl space-y-6">
      {/* week */}
      <section className="panel p-4">
        <div className="flex items-center gap-2">
          <Link href={`/log?w=${addDays(weekStart, -7)}`} className="btn-ghost rounded-lg px-2" aria-label="השבוע הקודם">
            <Icon name="chevronRight" className="size-5" />
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <p className="font-medium">{weekStart === thisWeek ? "השבוע" : `שבוע ${short(weekStart)}–${short(addDays(weekStart, 6))}`}</p>
            <p className="text-sm text-ink-soft">
              {duration(t.all)}
              {goal ? ` מתוך יעד של ${duration(goal)}` : ""}
            </p>
          </div>
          {weekStart < thisWeek ? (
            <Link href={`/log?w=${addDays(weekStart, 7)}`} className="btn-ghost rounded-lg px-2" aria-label="השבוע הבא">
              <Icon name="chevronLeft" className="size-5" />
            </Link>
          ) : (
            <span className="w-9" aria-hidden />
          )}
        </div>
        {goal ? (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-rule" aria-hidden>
            <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, (t.all / goal) * 100)}%` }} />
          </div>
        ) : null}
        {t.all > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {Object.entries(t.byCourse)
              .sort((a, b) => b[1] - a[1])
              .map(([code, m]) => (
                <li key={code} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: course(code).color }} aria-hidden />
                  {course(code).short}
                  <span className="tabular-nums text-ink-soft">{duration(m)}</span>
                </li>
              ))}
          </ul>
        )}
      </section>

      {editable && <AddHours courses={courses} today={today} weekStart={weekStart} onAdded={(e) => setEntries((xs) => [...xs, e].sort((a, b) => a.key.localeCompare(b.key)))} onError={setError} />}

      {error && (
        <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad" role="alert">
          {error}
        </p>
      )}

      {/* days */}
      <div className="space-y-4">
        {[...days].reverse().map((d) => {
          const list = entries.filter((e) => e.date === d);
          return (
            <section key={d}>
              <h2 className="mb-2 flex items-baseline justify-between text-sm">
                <span className="font-medium">{d === today ? `היום, ${dayName(d)}` : dayName(d)}</span>
                <span className="tabular-nums text-ink-soft">{list.length ? duration(t.byDay[d] ?? 0) : "לא נרשם לימוד"}</span>
              </h2>
              {list.length > 0 && (
                <ul className="panel divide-y divide-rule overflow-hidden">
                  {list.map((e) => (
                    <EntryRow key={e.key} e={e} course={course(e.code)} courses={courses} today={today} editable={editable} onSave={(p) => save(e, p)} onDelete={() => remove(e)} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {!days.length && <p className="text-ink-soft">אין ימים להציג בשבוע הזה.</p>}
      </div>

      {undo && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-40 flex justify-center px-4 md:bottom-6" role="status">
          <div className="flex items-center gap-4 rounded-full bg-ink px-5 py-2.5 text-sm text-bg shadow-lg">
            נמחקו {duration(undo.minutes)} ב{course(undo.code).short}
            <button type="button" onClick={restore} className="font-semibold underline underline-offset-4">
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EntryRow({
  e,
  course,
  courses,
  today,
  editable,
  onSave,
  onDelete,
}: {
  e: LogEntry;
  course: Course;
  courses: Course[];
  today: string;
  editable: boolean;
  onSave: (p: { minutes: number; date: string; code: string | null }) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(e.minutes);
  const [date, setDate] = useState(e.date);
  const [code, setCode] = useState<string | null>(e.code);
  const [confirm, setConfirm] = useState(false);

  if (!open)
    return (
      <li className="flex items-center gap-3 px-4 py-3">
        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: course.color }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{course.short}</span>
          <span className="block text-xs text-ink-soft">{e.label}</span>
        </span>
        <span className="tabular-nums">{duration(e.minutes)}</span>
        {editable && (
          <button type="button" onClick={() => setOpen(true)} className="btn-ghost rounded-lg px-2" aria-label={`עריכה: ${course.short}, ${duration(e.minutes)}`}>
            <Icon name="pencil" className="size-4" />
          </button>
        )}
      </li>
    );

  const step = (d: number) => setMinutes((m) => Math.max(5, Math.min(600, m + d)));
  const changed = minutes !== e.minutes || date !== e.date || code !== e.code;
  return (
    <li className="space-y-3 bg-bg/50 px-4 py-4">
      <div className="flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ background: course.color }} aria-hidden />
        <span className="font-medium">{course.short}</span>
        <span className="text-xs text-ink-soft">{e.label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">דקות</span>
        <button type="button" onClick={() => step(-15)} className="btn rounded-lg px-3" aria-label="פחות 15 דקות">
          <bdi dir="ltr">−15</bdi>
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={600}
          value={minutes}
          onChange={(ev) => setMinutes(Math.max(0, Math.min(600, Number(ev.target.value) || 0)))}
          className="w-20 rounded-lg border border-rule-strong bg-surface px-2 py-2 text-center tabular-nums"
          aria-label="דקות"
        />
        <button type="button" onClick={() => step(15)} className="btn rounded-lg px-3" aria-label="עוד 15 דקות">
          <bdi dir="ltr">+15</bdi>
        </button>
        <span className="text-sm text-ink-soft">{minutes > 0 ? duration(minutes) : ""}</span>
      </div>
      {e.movable ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            יום
            <input
              type="date"
              value={date}
              min={addDays(today, -LOG_BACK_DAYS)}
              max={today}
              onChange={(ev) => ev.target.value && setDate(ev.target.value)}
              className="rounded-lg border border-rule-strong bg-surface px-2 py-1.5"
            />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="קורס">
            {courses.map((c) => (
              <button key={c.code} type="button" aria-pressed={code === c.code} onClick={() => setCode(c.code)} className="chip text-sm">
                <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden />
                {c.short}
              </button>
            ))}
            <button type="button" aria-pressed={code === null} onClick={() => setCode(null)} className="chip text-sm">
              אחר
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-soft">מפגש מהתוכנית: היום והקורס שלו קבועים. כדי לרשום ביום אחר, למחוק ולהוסיף שעות.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!changed || minutes < 1}
          onClick={() => {
            onSave({ minutes, date, code });
            setOpen(false);
          }}
          className="btn-primary rounded-lg px-4"
        >
          שמירה
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setMinutes(e.minutes);
            setDate(e.date);
            setCode(e.code);
            setConfirm(false);
          }}
          className="btn-ghost rounded-lg px-3"
        >
          ביטול
        </button>
        <span className="flex-1" />
        {confirm ? (
          <button type="button" onClick={onDelete} className="btn rounded-lg border-bad px-3 text-bad">
            למחוק את הרישום?
          </button>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="btn-ghost rounded-lg px-3 text-bad">
            מחיקה
          </button>
        )}
      </div>
    </li>
  );
}

/** Hours that weren't reported: a day in the last two months, a course, minutes. */
function AddHours({
  courses,
  today,
  weekStart,
  onAdded,
  onError,
}: {
  courses: Course[];
  today: string;
  weekStart: string;
  onAdded: (e: LogEntry) => void;
  onError: (m: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const weekEnd = addDays(weekStart, 6);
  const [date, setDate] = useState(today < weekEnd ? today : weekEnd);
  const [code, setCode] = useState<string | null>(courses[0]?.code ?? null);
  const [minutes, setMinutes] = useState(45);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn rounded-xl px-4">
        <Icon name="plus" className="size-4" />
        הוספת שעות ששכחתי לרשום
      </button>
    );
  return (
    <form
      className={`panel space-y-3 p-4 ${pending ? "opacity-70" : ""}`}
      onSubmit={(ev) => {
        ev.preventDefault();
        start(async () => {
          onError(null);
          try {
            const key = await addStudyEntry({ date, code, minutes });
            if (date >= weekStart && date <= weekEnd)
              onAdded({ key, date, kind: "log", code, ref: key.split("|")[3], minutes, label: "רישום ידני", movable: true });
            setOpen(false);
          } catch (err) {
            onError((err as Error).message || "לא נשמר");
          }
        });
      }}
    >
      <h2 className="font-medium">הוספת שעות</h2>
      <label className="flex items-center gap-2 text-sm">
        יום
        <input type="date" value={date} min={addDays(today, -LOG_BACK_DAYS)} max={today} onChange={(ev) => ev.target.value && setDate(ev.target.value)} className="rounded-lg border border-rule-strong bg-surface px-2 py-1.5" />
      </label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="קורס">
        {courses.map((c) => (
          <button key={c.code} type="button" aria-pressed={code === c.code} onClick={() => setCode(c.code)} className="chip text-sm">
            <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden />
            {c.short}
          </button>
        ))}
        <button type="button" aria-pressed={code === null} onClick={() => setCode(null)} className="chip text-sm">
          אחר
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {[30, 45, 60, 90].map((m) => (
          <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)} className="chip text-sm tabular-nums">
            {duration(m)}
          </button>
        ))}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={600}
          value={minutes}
          onChange={(ev) => setMinutes(Math.max(0, Math.min(600, Number(ev.target.value) || 0)))}
          className="w-20 rounded-lg border border-rule-strong bg-surface px-2 py-2 text-center tabular-nums"
          aria-label="דקות"
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={pending || minutes < 1} className="btn-primary rounded-lg px-4">
          הוספה
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost rounded-lg px-3">
          ביטול
        </button>
      </div>
    </form>
  );
}
