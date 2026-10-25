"use client";
import { durationShort } from "@/lib/time";
import { CourseChip } from "@/components/CourseChip";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  addEvent,
  deleteEvent,
  setDayOff,
  setRoutineOccurrence,
  setRoutineTiming,
  setSessionMove,
  setSessionStatus,
  updateEvent,
} from "@/app/act";
import { Icon } from "@/components/Icon";
import { SessionEditor } from "@/components/SessionEditor";
import { describeRepeat, type Repeat } from "@/lib/repeat";
import { hoursLabel, weekBalance, type WeekBalance } from "@/lib/weekBalance";

export type CalKind =
  "due" | "exam" | "study" | "event" | "tutorial" | "academic" | "routine";

export interface CalItem {
  date: string; // YYYY-MM-DD
  kind: CalKind;
  color: string;
  label: string;
  /** the course's short name (month cells) */
  short?: string;
  start?: string; // "18:00"
  end?: string;
  minutes?: number;
  done?: boolean;
  sessionKey?: string;
  status?: "done" | "skipped";
  eventId?: string;
  deletable?: boolean;
  holiday?: boolean;
  /** e.g. "with Dana", "invited by Noa" */
  note?: string;
  /** my own event: can be dragged, resized and edited */
  editable?: boolean;
  /** raw fields for the editor (label may add the location) */
  title?: string;
  location?: string;
  /** keeps the planner from placing study at this time */
  blocks?: boolean;
  /** a routine occurrence: which routine, its override key, and whether I may change it */
  routine?: { id: string; key: string; flexible: boolean; mine: boolean; moved: boolean; title: string };
  /** a planned study session I may move (key = sessionKey) */
  study?: { moved: boolean };
  /** an optional slot (phone tutoring hours): shown, but the time still counts as free */
  optional?: boolean;
  /** repeating event */
  seriesId?: string;
  repeat?: Repeat;
}

/** What the editor opens with: a new event (a time range) or one of mine. */
type EditorState =
  | {
      mode: "new";
      date: string;
      start?: string;
      end?: string;
      allDay?: boolean;
    }
  | { mode: "edit"; item: CalItem }
  | { mode: "routine"; item: CalItem }
  | { mode: "study"; item: CalItem };
type Placement = { date: string; start: string; end: string };
/** Identity of a movable item (own event or routine occurrence). */
const itemId = (i: CalItem) => i.eventId ?? (i.routine ? `r:${i.routine.id}:${i.routine.key}` : i.study && i.sessionKey ? `s:${i.sessionKey}` : undefined);
const canEdit = (i: CalItem) => !!(i.editable || i.routine?.mine || i.study);

const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: "UTC", ...o }).format(
    new Date(iso + "T00:00:00Z"),
  );
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekStart = (iso: string) =>
  addDays(iso, -new Date(iso + "T00:00:00Z").getUTCDay());
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const timed = (i: CalItem) => !!(i.start && i.end);
/** "24:00" (runs to midnight) reads as 00:00. */
const clock = (t?: string) => (t === "24:00" ? "00:00" : (t ?? ""));
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const SNAP = 15;
const snap = (m: number) => Math.round(m / SNAP) * SNAP;

function daysOfMonth(ym: string): (string | null)[] {
  const first = ym + "-01";
  const cells: (string | null)[] = Array(
    new Date(first + "T00:00:00Z").getUTCDay(),
  ).fill(null);
  for (let d = first; d.startsWith(ym); d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

const rank: Record<CalKind, number> = {
  academic: 0,
  exam: 1,
  due: 2,
  tutorial: 3,
  event: 4,
  study: 5,
  routine: 6,
};
/** All-day items first (deadlines and exams on top), then the day in time order. */
export const order = (a: CalItem, b: CalItem) => {
  const ta = timed(a);
  const tb = timed(b);
  if (ta !== tb) return ta ? 1 : -1;
  if (!ta) return rank[a.kind] - rank[b.kind] || a.label.localeCompare(b.label);
  return a.start!.localeCompare(b.start!) || a.end!.localeCompare(b.end!) || rank[a.kind] - rank[b.kind];
};

/** Saves a dragged routine occurrence as a one-off change (undo puts back what was there). */
async function saveRoutineMove(item: CalItem, p: Placement, undo: boolean) {
  const r = item.routine!;
  const minutes = toMin(p.end) - toMin(p.start);
  if (undo && !r.moved) {
    // it wasn't changed before: drop the one-off change(s)
    await setRoutineOccurrence(r.id, r.flexible ? item.date : r.key, null);
    if (r.flexible && item.date !== r.key) await setRoutineOccurrence(r.id, r.key, null);
    return;
  }
  if (r.flexible) {
    // a flexible routine is pinned on the new day; the old day stops counting
    await setRoutineOccurrence(r.id, p.date, { start: p.start, minutes });
    if (p.date !== item.date) await setRoutineOccurrence(r.id, item.date, { skip: true });
  } else {
    await setRoutineOccurrence(r.id, r.key, { start: p.start, minutes, ...(p.date !== r.key && { date: p.date }) });
  }
}

export function SemesterCalendar({
  items,
  today,
  legend,
  editable,
  people = [],
  offDays = [],
  repeatUntil,
  balance,
}: {
  /** default last date for a repeating event (the semester's end) */
  repeatUntil: string;
  /** for the week's free time vs study goal strip */
  balance?: { studied: Record<string, number>; goal: number | null; wake: number; bed: number; nowMin: number };
  /** rough days / days off */
  offDays?: string[];
  items: CalItem[];
  today: string;
  legend: { color: string; label: string }[];
  editable: boolean;
  /** friends who can be invited to an event */
  people?: { id: string; name: string }[];
}) {
  const [showRoutines, setShowRoutines] = useState(true);
  // Moves shown right away, before the server answers. A fresh items list replaces them.
  const [moved, setMoved] = useState<Map<string, Placement>>(new Map());
  const [seenItems, setSeenItems] = useState(items);
  if (seenItems !== items) {
    setSeenItems(items);
    setMoved(new Map());
  }
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [toast, setToast] = useState<{
    text: string;
    undo?: () => void;
  } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const place = (item: CalItem, to: Placement) => {
    const id = itemId(item)!;
    const from = { date: item.date, start: item.start!, end: item.end! };
    if (from.date === to.date && from.start === to.start && from.end === to.end)
      return;
    const save = (p: Placement, undo: boolean) =>
      item.routine
        ? saveRoutineMove(item, p, undo)
        : item.study
          ? setSessionMove(item.sessionKey!, undo && !item.study.moved ? null : { date: p.date, start: p.start, minutes: toMin(p.end) - toMin(p.start) })
          : updateEvent({ id: item.eventId!, ...p });
    const go = (p: Placement, undo: boolean, after?: () => void) => {
      setMoved((m) => new Map(m).set(id, p));
      save(p, undo)
        .then(after)
        .catch((e: Error) => {
          setMoved((m) => {
            const n = new Map(m);
            n.delete(id);
            return n;
          });
          setToast({ text: e.message || "השינוי לא נשמר" });
        });
    };
    go(to, false, () =>
      setToast({
        text:
          (from.date === to.date && from.start === to.start
            ? `המשך שונה: \u2066${to.start}–${clock(to.end)}\u2069`
            : `הוזז ל${fmt(to.date, { weekday: "long" })} \u2066${to.start}\u2069`) +
          (item.seriesId || item.routine ? " (רק הפעם)" : ""),
        undo: () => go(from, true, () => setToast(null)),
      }),
    );
  };

  const byDate = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const raw of items) {
      const it =
        itemId(raw) && moved.has(itemId(raw)!)
          ? { ...raw, ...moved.get(itemId(raw)!)! }
          : raw;
      if (!showRoutines && it.kind === "routine") continue;
      if (!m.has(it.date)) m.set(it.date, []);
      m.get(it.date)!.push(it);
    }
    for (const l of m.values()) l.sort(order);
    return m;
  }, [items, showRoutines, moved]);

  const [view, setView] = useState<"week" | "month">("week");
  // /semester?d=2026-10-27 (from Today's week strip) opens on that day
  const asked = useSearchParams().get("d");
  const start = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today;
  const [anchor, setAnchor] = useState(start); // any day inside the shown week / month
  const [selected, setSelected] = useState(start);

  const move = (dir: 1 | -1) => {
    if (view === "week") {
      const next = addDays(weekStart(anchor), dir * 7);
      setAnchor(next);
      setSelected(next <= today && today < addDays(next, 7) ? today : next);
    } else {
      const [y, m] = anchor.slice(0, 7).split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1 + dir, 1))
        .toISOString()
        .slice(0, 10);
      setAnchor(d);
      setSelected(d.slice(0, 7) === today.slice(0, 7) ? today : d);
    }
  };
  const goToday = () => {
    setAnchor(today);
    setSelected(today);
  };

  const title =
    view === "month"
      ? fmt(anchor.slice(0, 7) + "-01", { month: "long", year: "numeric" })
      : (() => {
          const s = weekStart(anchor);
          const e = addDays(s, 6);
          return `${fmt(s, { day: "numeric", month: "short" })} – ${fmt(e, { day: "numeric", month: "short", year: "numeric" })}`;
        })();

  const week =
    view === "week" && balance
      ? weekBalance({
          days: Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i)),
          blocksOn: (d) =>
            (byDate.get(d) ?? [])
              .filter((i) => timed(i) && !i.optional)
              .map((i) => ({ start: i.start!, end: i.end!, kind: i.kind, minutes: i.minutes, status: i.status })),
          today,
          nowMin: balance.nowMin,
          wake: balance.wake,
          bed: balance.bed,
          studied: balance.studied,
          goal: balance.goal,
        })
      : null;

  return (
    // Full content width (the page breaks out of the usual max width, see .page-wide); the selected
    // day's panel sits under the grid so the day columns get the room.
    <div className="page-wide grid gap-6">
      <div className="panel min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-rule px-3 py-3 sm:px-5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => move(-1)}
              className="btn-ghost px-3"
              aria-label="הקודם"
            >
              <Icon name="chevronRight" className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              className="btn-ghost px-3"
              aria-label="הבא"
            >
              <Icon name="chevronLeft" className="size-4" />
            </button>
          </div>
          <h2 className="section-title">{title}</h2>
          <button
            type="button"
            onClick={goToday}
            className="btn"
          >
            היום
          </button>
          <button
            type="button"
            aria-pressed={showRoutines}
            onClick={() => setShowRoutines((v) => !v)}
            className="chip ms-auto"
          >
            {showRoutines && <Icon name="check" className="size-4" />}
            שגרה
          </button>
          <div
            className="seg"
            role="tablist"
            aria-label="תצוגה"
          >
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className="seg-item"
              >
                {v === "week" ? "שבוע" : "חודש"}
              </button>
            ))}
          </div>
        </div>

        {week && <WeekBalanceStrip b={week} />}

        {view === "month" ? (
          <MonthGrid
            month={anchor.slice(0, 7)}
            byDate={byDate}
            today={today}
            selected={selected}
            onSelect={setSelected}
          />
        ) : (
          <WeekGrid
            start={weekStart(anchor)}
            byDate={byDate}
            today={today}
            selected={selected}
            onSelect={setSelected}
            editable={editable}
            onPlace={place}
            onEdit={(item) => setEditor({ mode: item.routine ? "routine" : item.study ? "study" : "edit", item })}
            onCreate={(p) => {
              setSelected(p.date);
              setEditor({ mode: "new", ...p });
            }}
          />
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-rule px-4 py-3 text-xs text-ink-soft sm:px-5">
          {legend.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full"
                style={{ background: l.color }}
              />
              {l.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-ink-soft" />
            לוח אקדמי ואירועים
          </span>
        </div>
      </div>

      <DayPanel
        date={selected}
        items={byDate.get(selected) ?? []}
        editable={editable}
        isOff={offDays.includes(selected)}
        today={today}
        onEdit={(item) => setEditor({ mode: item.routine ? "routine" : item.study ? "study" : "edit", item })}
        onNew={() =>
          setEditor({
            mode: "new",
            date: selected,
            start: "18:00",
            end: "19:00",
          })
        }
      />

      {editor?.mode === "routine" && (
        <RoutineEditor item={editor.item} onClose={() => setEditor(null)} onDone={(text) => setToast({ text })} />
      )}

      {editor?.mode === "study" && (
        <SessionEditor
          sessionKey={editor.item.sessionKey!}
          title={editor.item.label}
          date={editor.item.date}
          start={editor.item.start!}
          minutes={toMin(editor.item.end!) - toMin(editor.item.start!)}
          moved={editor.item.study!.moved}
          today={today}
          onClose={() => setEditor(null)}
          onDone={(text) => setToast({ text })}
        />
      )}
      {editor && editor.mode !== "routine" && editor.mode !== "study" && (
        <EventEditor
          state={editor}
          people={people}
          repeatUntil={repeatUntil}
          onClose={() => setEditor(null)}
          onDone={(text) => setToast({ text })}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-24 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-4 rounded-xl bg-ink px-4 py-3 text-sm text-bg shadow-lg md:bottom-8"
        >
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={toast.undo}
              className="font-semibold underline underline-offset-4"
            >
              ביטול
            </button>
          )}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="סגירה"
            className="opacity-70 hover:opacity-100"
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Week balance ---------- */

function WeekBalanceStrip({ b }: { b: WeekBalance }) {
  const target = b.goal ?? 0;
  const scale = Math.max(target, b.done + b.planned, 1);
  const pct = (m: number) => `${(Math.min(m, scale) / scale) * 100}%`;
  let verdict: string;
  if (b.past) verdict = b.goal ? (b.done >= b.goal ? "עמדת ביעד השבוע" : `${hoursLabel(b.goal - b.done)} מתחת ליעד`) : "";
  else if (!b.goal) verdict = "";
  else if (b.gap === 0) verdict = "התוכנית מגיעה ליעד";
  else if (b.free >= b.gap) verdict = `חסרות ${hoursLabel(b.gap)} ליעד, ויש מספיק זמן פנוי`;
  else verdict = `חסרות ${hoursLabel(b.gap)} ליעד, ואין מספיק זמן פנוי`;
  const short = !b.past && !!b.goal && b.gap > b.free;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule px-4 py-3 text-sm sm:px-5" aria-live="polite">
      {!b.past && (
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl tabular-nums">{hoursLabel(b.free)}</span>
          <span className="text-ink-soft">פנויות עד סוף השבוע</span>
        </div>
      )}
      <div className="min-w-56 flex-1">
        <div className="flex flex-wrap justify-between gap-x-3 text-xs text-ink-soft">
          <span>
            <span className="font-medium text-ink">{hoursLabel(b.done)}</span> לימוד בוצע
            {!b.past && (
              <>
                {" "}+ <span className="font-medium text-ink">{hoursLabel(b.planned)}</span> מתוכנן
              </>
            )}
          </span>
          {b.goal ? (
            <span>יעד {hoursLabel(b.goal)}</span>
          ) : (
            <a href="/profile" className="underline decoration-rule underline-offset-4 hover:text-ink">
              הגדרת יעד שבועי
            </a>
          )}
        </div>
        <div className="relative mt-1.5 flex h-2 overflow-hidden rounded-full bg-rule/70" role="img" aria-label={`בוצע ${hoursLabel(b.done)}, מתוכנן ${hoursLabel(b.planned)}${b.goal ? `, יעד ${hoursLabel(b.goal)}` : ""}`}>
          <span className="h-full bg-ink" style={{ width: pct(b.done) }} />
          {!b.past && (
            <span
              className="h-full"
              style={{
                width: pct(b.planned),
                background: "repeating-linear-gradient(-45deg, var(--ink) 0 3px, transparent 3px 6px)",
                opacity: 0.45,
              }}
            />
          )}
          {b.goal ? <span className="absolute inset-y-0 w-0.5 bg-ink" style={{ insetInlineStart: pct(b.goal) }} /> : null}
        </div>
        {verdict && <div className={`mt-1 text-xs ${short ? "font-medium text-ink" : "text-ink-soft"}`}>{short ? <span className="hl">{verdict}</span> : verdict}</div>}
      </div>
    </div>
  );
}

/* ---------- Month ---------- */

function MonthGrid({
  month,
  byDate,
  today,
  selected,
  onSelect,
}: {
  month: string;
  byDate: Map<string, CalItem[]>;
  today: string;
  selected: string;
  onSelect: (d: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-7 border-b border-rule text-center text-xs text-ink-soft">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {daysOfMonth(month).map((d, i) => {
          const edge = (i + 1) % 7 === 0 ? "border-e-0" : "";
          if (!d)
            return (
              <div
                key={`e${i}`}
                className={`border-b border-e border-rule bg-bg/40 ${edge}`}
              />
            );
          const list = byDate.get(d) ?? [];
          const marks = list.filter((x) => x.kind !== "study");
          const study = list.filter(
            (x) => x.kind === "study" && x.status !== "skipped",
          );
          const studyMin = study.reduce((s, x) => s + (x.minutes ?? 0), 0);
          const holiday = list.some((x) => x.holiday);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelect(d)}
              aria-pressed={d === selected}
              aria-label={`${fmt(d, { weekday: "long", day: "numeric", month: "long" })}${marks.length ? `, ${marks.map((m) => m.label).join(", ")}` : ""}`}
              className={`flex min-h-14 flex-col gap-1 border-b border-e border-rule p-1 text-start md:min-h-28 md:p-1.5 ${edge} ${
                d === selected
                  ? "bg-bg"
                  : holiday
                    ? "bg-bg/50 hover:bg-bg"
                    : "hover:bg-bg/60"
              } ${d < today ? "text-ink-soft" : ""}`}
            >
              <span
                className={`grid size-6 place-items-center rounded-full text-xs tabular-nums md:text-[13px] ${
                  d === today ? "bg-ink font-semibold text-bg" : ""
                }`}
              >
                {Number(d.slice(8))}
              </span>
              <span className="hidden flex-col gap-1 md:flex">
                {marks.map((m, k) => (
                  <Chip key={k} item={m} />
                ))}
                {studyMin > 0 &&
                  // one line per course: "● לינארית 1.5 ש׳"
                  Object.values(
                    study.reduce<Record<string, { short: string; color: string; min: number }>>((m, s) => {
                      const k = s.short ?? s.color;
                      m[k] = { short: s.short ?? "לימוד", color: s.color, min: (m[k]?.min ?? 0) + (s.minutes ?? 0) };
                      return m;
                    }, {}),
                  ).map((g) => (
                    <span key={g.short} className="flex items-center gap-1 px-1 text-[11px] text-ink-soft">
                      <CourseChip short={g.short} color={g.color} className="min-w-0 flex-1" />
                      <span className="shrink-0 tabular-nums">{durationShort(g.min)}</span>
                    </span>
                  ))}
              </span>
              <span className="flex flex-wrap gap-0.5 px-0.5 md:hidden">
                {marks.map((m, k) => (
                  <span
                    key={k}
                    className={
                      m.kind === "exam"
                        ? "h-1.5 w-3 rounded-full"
                        : "size-1.5 rounded-full"
                    }
                    style={{
                      background: m.done ? "transparent" : m.color,
                      border: `1.5px solid ${m.color}`,
                    }}
                  />
                ))}
                {studyMin > 0 && (
                  <span className="h-0.5 w-full rounded bg-rule" />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ---------- Week ---------- */

const HOUR_PX = 46;

interface Drag {
  kind: "move" | "resize" | "create";
  item?: CalItem;
  x0: number;
  y0: number;
  /** minute under the pointer when it went down (create) or the item's own times (move/resize) */
  anchor: number;
  s0: number;
  e0: number;
  date: string;
  s: number;
  e: number;
  active: boolean;
}

function WeekGrid({
  start,
  byDate,
  today,
  selected,
  onSelect,
  editable,
  onPlace,
  onEdit,
  onCreate,
}: {
  start: string;
  byDate: Map<string, CalItem[]>;
  today: string;
  selected: string;
  onSelect: (d: string) => void;
  editable: boolean;
  onPlace: (item: CalItem, to: Placement) => void;
  onEdit: (item: CalItem) => void;
  onCreate: (p: {
    date: string;
    start?: string;
    end?: string;
    allDay?: boolean;
  }) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const all = days.flatMap((d) => byDate.get(d) ?? []);
  const timedItems = all.filter(timed);
  const minH = Math.min(
    8,
    ...timedItems.map((i) => Math.floor(toMin(i.start!) / 60)),
  );
  const maxH = Math.max(
    22,
    ...timedItems.map((i) => Math.ceil(toMin(i.end!) / 60)),
  );
  const hoursList = Array.from({ length: maxH - minH }, (_, i) => minH + i);
  const scroller = useRef<HTMLDivElement>(null);
  const firstStudy = Math.min(
    ...timedItems.map((i) => toMin(i.start!)),
    17 * 60,
  );
  useEffect(() => {
    if (scroller.current)
      scroller.current.scrollTop = Math.max(
        0,
        ((firstStudy - minH * 60) / 60 - 0.5) * HOUR_PX,
      );
  }, [start, firstStudy, minH]);

  // ---- drag: move / resize my events, drag on empty time to create ----
  const cols = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const set = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };
  const lo = minH * 60;
  const hi = Math.min(maxH * 60, 24 * 60 - 1);
  const minuteAt = (y: number, col: HTMLDivElement) =>
    lo + ((y - col.getBoundingClientRect().top) / HOUR_PX) * 60;
  const dayAt = (x: number) => {
    const i = cols.current.findIndex((c) => {
      if (!c) return false;
      const r = c.getBoundingClientRect();
      return x >= r.left && x < r.right;
    });
    return i >= 0 ? days[i] : null;
  };

  const down = (
    e: React.PointerEvent,
    d: string,
    kind: Drag["kind"],
    item?: CalItem,
  ) => {
    if (!editable || e.button !== 0) return;
    e.stopPropagation();
    const col = cols.current[days.indexOf(d)];
    if (!col) return;
    if (kind === "create") {
      // Touch: a tap creates (dragging stays scrolling). Mouse: press and drag to draw the range.
      const m = Math.max(
        lo,
        Math.min(hi - 60, Math.floor(minuteAt(e.clientY, col) / 30) * 30),
      );
      set({
        kind,
        x0: e.clientX,
        y0: e.clientY,
        anchor: m,
        s0: m,
        e0: m + 60,
        date: d,
        s: m,
        e: m + 60,
        active: false,
      });
      if (e.pointerType === "mouse")
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      return;
    }
    const s0 = toMin(item!.start!);
    const e0 = toMin(item!.end!);
    set({
      kind,
      item,
      x0: e.clientX,
      y0: e.clientY,
      anchor: s0,
      s0,
      e0,
      date: d,
      s: s0,
      e: e0,
      active: false,
    });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const moveTo = (e: React.PointerEvent) => {
    const g = dragRef.current;
    if (!g) return;
    const far = Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) > 5;
    if (!g.active && !far) return;
    if (g.kind === "create" && e.pointerType !== "mouse") return set(null); // a touch that moves is a scroll
    const delta = snap(((e.clientY - g.y0) / HOUR_PX) * 60);
    let next: Drag;
    if (g.kind === "move") {
      const len = g.e0 - g.s0;
      const s = Math.max(lo, Math.min(hi - len, g.s0 + delta));
      next = {
        ...g,
        active: true,
        date: dayAt(e.clientX) ?? g.date,
        s,
        e: s + len,
      };
    } else if (g.kind === "resize") {
      next = {
        ...g,
        active: true,
        e: Math.max(g.s0 + SNAP, Math.min(hi, snap(g.e0 + delta))),
      };
    } else {
      const col = cols.current[days.indexOf(g.date)]!;
      const m = Math.max(lo, Math.min(hi, snap(minuteAt(e.clientY, col))));
      const s = Math.min(g.anchor, m);
      next = {
        ...g,
        active: true,
        s,
        e: Math.max(s + SNAP, Math.max(g.anchor + SNAP, m)),
      };
    }
    set(next);
  };

  // A drag that ends outside the grid (or after its block re-rendered elsewhere) still ends.
  const upRef = useRef(() => {});
  useEffect(() => {
    if (!drag) return;
    const end = () => upRef.current();
    window.addEventListener("pointerup", end);
    return () => window.removeEventListener("pointerup", end);
  }, [drag]);

  const up = () => {
    const g = dragRef.current;
    set(null);
    if (!g) return;
    if (g.kind === "create")
      return onCreate({
        date: g.date,
        start: hhmm(g.s),
        end: hhmm(Math.min(g.e, 24 * 60 - 1)),
      });
    if (!g.active) return onEdit(g.item!);
    onPlace(g.item!, {
      date: g.date,
      start: hhmm(g.s),
      end: hhmm(Math.min(g.e, 24 * 60 - 1)),
    });
  };
  useEffect(() => {
    upRef.current = up;
  });

  return (
    <>
      {/* Phone: one row per day */}
      <ol className="divide-y divide-rule md:hidden">
        {groupFree(
          days,
          (d) =>
            (byDate.get(d) ?? []).length === 0 && d !== today && d !== selected,
        ).map((g) => {
          if (Array.isArray(g))
            return (
              <li key={g[0]}>
                <button
                  type="button"
                  onClick={() => onSelect(g[0])}
                  className="flex w-full items-center gap-3 px-4 py-2 text-start text-sm text-ink-soft"
                >
                  <span className="w-12 shrink-0 text-xs">
                    {fmt(g[0], { weekday: "short" })}–
                    {fmt(g[g.length - 1], { weekday: "short" })}
                  </span>
                  <span>{g.length} ימים פנויים</span>
                </button>
              </li>
            );
          const d = g;
          const list = byDate.get(d) ?? [];
          return (
            <li key={d}>
              <button
                type="button"
                onClick={() => onSelect(d)}
                className={`flex w-full gap-3 px-4 py-3 text-start ${d === selected ? "bg-bg" : ""}`}
              >
                <span className="w-12 shrink-0 leading-tight">
                  <span
                    className={`block text-xs ${d === today ? "font-semibold text-ink" : "text-ink-soft"}`}
                  >
                    {fmt(d, { weekday: "short" })}
                  </span>
                  <span
                    className={`mt-0.5 grid size-7 place-items-center rounded-full text-sm tabular-nums ${
                      d === today ? "bg-ink font-semibold text-bg" : ""
                    }`}
                  >
                    {Number(d.slice(8))}
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {list.length === 0 && (
                    <span className="pt-1 text-sm text-ink-soft">פנוי</span>
                  )}
                  {list.map((it, k) => (
                    <span key={k} className="flex items-center gap-2 text-sm">
                      <span
                        dir="ltr"
                        className="w-[4.75rem] shrink-0 text-end tabular-nums text-xs text-ink-soft"
                      >
                        {timed(it) ? `${it.start}–${clock(it.end)}` : it.start ? it.start : it.kind === "routine" ? "בלי שעה" : "כל היום"}
                      </span>
                      <span
                        className={`h-4 w-1 shrink-0 rounded-full ${it.optional ? "opacity-50" : ""}`}
                        style={{ background: it.color }}
                      />
                      <span
                        className={`min-w-0 flex-1 truncate ${it.status === "skipped" || it.done ? "line-through text-ink-soft" : ""} ${
                          it.kind === "exam" ? "font-semibold" : ""
                        }`}
                      >
                        {it.status === "done" ? "✓ " : ""}
                        {it.label}
                      </span>
                    </span>
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* PC: time grid */}
      <div className="hidden md:block">
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-rule">
          <div />
          {days.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onSelect(d)}
              className={`border-s border-rule py-2 text-center ${d === selected ? "bg-bg" : "hover:bg-bg/60"}`}
            >
              <div className="text-xs text-ink-soft">
                {fmt(d, { weekday: "short" })}
              </div>
              <div
                className={`mx-auto mt-0.5 grid size-7 place-items-center rounded-full text-sm tabular-nums ${
                  d === today ? "bg-ink font-semibold text-bg" : ""
                }`}
              >
                {Number(d.slice(8))}
              </div>
            </button>
          ))}
        </div>

        {/* all-day row */}
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-rule">
          <div className="py-1.5 text-center text-[11px] text-ink-soft">
            כל היום
          </div>
          {days.map((d) => (
            <div
              key={d}
              className={`flex min-h-9 flex-col gap-1 border-s border-rule p-1 ${editable ? "cursor-cell" : ""}`}
              onClick={() =>
                editable ? onCreate({ date: d, allDay: true }) : onSelect(d)
              }
              title={editable ? "אירוע של כל היום" : undefined}
            >
              {(byDate.get(d) ?? [])
                .filter((x) => !timed(x))
                .map((it, k) => (
                  <Chip
                    key={k}
                    item={it}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (editable && it.editable) onEdit(it);
                      else onSelect(d);
                    }}
                  />
                ))}
            </div>
          ))}
        </div>

        <div ref={scroller} className="max-h-[34rem] overflow-y-auto pt-2">
          <div className="relative grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
            <div>
              {hoursList.map((h) => (
                <div
                  key={h}
                  className="relative text-center text-[11px] text-ink-soft tabular-nums"
                  style={{ height: HOUR_PX }}
                >
                  <span className="relative -top-2">
                    {String(h).padStart(2, "0")}:00
                  </span>
                </div>
              ))}
            </div>
            {days.map((d, di) => (
              <div
                key={d}
                ref={(el) => {
                  cols.current[di] = el;
                }}
                className={`relative border-s border-rule ${d === selected ? "bg-bg/60" : ""} ${editable ? "cursor-cell" : ""}`}
                onClick={() => !editable && onSelect(d)}
                onPointerDown={(e) =>
                  editable ? down(e, d, "create") : undefined
                }
                onPointerMove={moveTo}
                onPointerUp={up}
                onPointerCancel={() => set(null)}
              >
                {hoursList.map((h) => (
                  <div
                    key={h}
                    className="pointer-events-none border-t border-rule/70"
                    style={{ height: HOUR_PX }}
                  />
                ))}
                {(() => {
                  // The dragged event is drawn where it would land (maybe in another day's column).
                  const dragged = drag?.active && drag.item ? drag.item : null;
                  const list = (byDate.get(d) ?? []).filter(
                    (x) => timed(x) && x !== dragged,
                  );
                  if (dragged && drag!.date === d)
                    list.push({
                      ...dragged,
                      date: d,
                      start: hhmm(drag!.s),
                      end: hhmm(drag!.e),
                    });
                  const lay = columns(list);
                  return list.map((it, k) => {
                    const top = ((toMin(it.start!) - minH * 60) / 60) * HOUR_PX;
                    const { col, cols: n } = lay.get(it)!;
                    const height = Math.max(
                      20,
                      ((toMin(it.end!) - toMin(it.start!)) / 60) * HOUR_PX - 2,
                    );
                    const faded = it.status === "skipped";
                    const isDragged = dragged && itemId(it) === itemId(dragged);
                    const mine = editable && canEdit(it);
                    return (
                      <div
                        key={k}
                        role="button"
                        tabIndex={0}
                        aria-label={`${it.label}, ${it.start}–${it.end}${mine ? ". גררו כדי להזיז, Enter לעריכה" : ""}`}
                        onPointerDown={(e) =>
                          mine ? down(e, d, "move", it) : e.stopPropagation()
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!mine) onSelect(d);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          if (mine) onEdit(it);
                          else onSelect(d);
                        }}
                        className={`group absolute select-none overflow-hidden rounded-md px-1.5 py-1 text-start text-[11px] leading-tight focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${
                          faded ? "opacity-40" : ""
                        } ${mine ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"} ${isDragged ? "z-20 shadow-lg ring-2 ring-ink/40" : ""}`}
                        style={{
                          top,
                          height,
                          insetInlineStart: `calc(${(col / n) * 100}% + 2px)`,
                          width: isDragged
                            ? "calc(100% - 4px)"
                            : `calc(${100 / n}% - 4px)`,
                          background:
                            it.kind === "study" || it.kind === "routine" || it.optional
                              ? `color-mix(in srgb, ${it.color} ${it.kind === "study" ? 16 : 10}%, var(--surface))`
                              : `color-mix(in srgb, ${it.color} 85%, black)`,
                          color:
                            it.kind === "study" || it.kind === "routine" || it.optional
                              ? "var(--ink)"
                              : "white",
                          borderInlineStart: `3px ${it.optional ? "dashed" : "solid"} ${it.color}`,
                          ...(it.optional && { outline: `1px dashed color-mix(in srgb, ${it.color} 50%, transparent)`, outlineOffset: -1, opacity: 0.8 }),
                        }}
                      >
                        <span
                          className={`block font-medium ${faded || (it.kind === "routine" && it.done) ? "line-through" : ""}`}
                        >
                          {it.status === "done" ||
                          (it.kind === "routine" && it.done)
                            ? "✓ "
                            : ""}
                          {it.label}
                        </span>
                        <span className="block opacity-75 tabular-nums">
                          <bdi dir="ltr">{it.start}–{clock(it.end)}</bdi>
                        </span>
                        {mine && (
                          <span
                            aria-hidden
                            onPointerDown={(e) =>
                              down(e, d, "resize", isDragged ? dragged! : it)
                            }
                            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize touch-none"
                          >
                            <span className="mx-auto mt-0.5 block h-0.5 w-6 rounded-full bg-current opacity-0 transition-opacity group-hover:opacity-60" />
                          </span>
                        )}
                      </div>
                    );
                  });
                })()}
                {drag?.kind === "create" && drag.date === d && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0.5 z-10 rounded-md border-2 border-dashed border-ink/60 bg-ink/10 px-1.5 py-1 text-[11px] tabular-nums"
                    style={{
                      top: ((drag.s - lo) / 60) * HOUR_PX,
                      height: Math.max(
                        18,
                        ((drag.e - drag.s) / 60) * HOUR_PX - 2,
                      ),
                    }}
                  >
                    אירוע חדש · <bdi dir="ltr">{hhmm(drag.s)}–{hhmm(Math.min(drag.e, 1439))}</bdi>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/** Runs of 2+ free days become one entry (an array); other days stay as they are. */
function groupFree(
  days: string[],
  free: (d: string) => boolean,
): (string | string[])[] {
  const out: (string | string[])[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 2) out.push(run);
    else out.push(...run);
    run = [];
  };
  for (const d of days) {
    if (free(d)) run.push(d);
    else {
      flush();
      out.push(d);
    }
  }
  flush();
  return out;
}

/** Overlapping timed items share the width: each gets a column inside its overlap group. */
function columns(list: CalItem[]) {
  const out = new Map<CalItem, { col: number; cols: number }>();
  const sorted = [...list].sort(
    (a, b) =>
      toMin(a.start!) - toMin(b.start!) || toMin(b.end!) - toMin(a.end!),
  );
  let group: CalItem[] = [];
  let groupEnd = -1;
  let colEnds: number[] = [];
  const flush = () => {
    for (const it of group) out.get(it)!.cols = colEnds.length;
    group = [];
    colEnds = [];
  };
  for (const it of sorted) {
    const st = toMin(it.start!);
    const en = Math.max(toMin(it.end!), st + 20);
    if (st >= groupEnd) flush();
    let col = colEnds.findIndex((e) => e <= st);
    if (col < 0) col = colEnds.push(en) - 1;
    else colEnds[col] = en;
    out.set(it, { col, cols: 1 });
    group.push(it);
    groupEnd = Math.max(groupEnd, en);
  }
  flush();
  return out;
}

/* ---------- Day panel (details + planner actions) ---------- */

function DayPanel({
  date,
  items,
  editable,
  isOff,
  today,
  onEdit,
  onNew,
}: {
  date: string;
  items: CalItem[];
  editable: boolean;
  isOff: boolean;
  today: string;
  onEdit: (item: CalItem) => void;
  onNew: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message || "השמירה נכשלה. נסו שוב.");
      }
    });

  return (
    <aside
      className={`panel p-5 ${pending ? "opacity-70" : ""}`}
      aria-live="polite"
    >
      <h3 className="font-semibold">
        {fmt(date, { weekday: "long", day: "numeric", month: "long" })}
      </h3>
      {isOff && (
        <p className="mt-1 text-sm">יום מנוחה: בלי לימוד, והרצפים נשמרים.</p>
      )}

      {items.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">
          אין הגשות, בחינות או לימוד מתוכנן.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 lg:grid-cols-2 lg:gap-x-8 2xl:grid-cols-3">
          {items.map((it, k) => (
            <li key={k} className="flex gap-3">
              <span
                className="mt-1 h-4 w-1 shrink-0 rounded-full"
                style={{ background: it.color }}
              />
              <div className="min-w-0 flex-1">
                <div
                  className={`${it.done || it.status === "skipped" ? "line-through text-ink-soft" : ""} ${
                    it.kind === "exam" ? "font-semibold" : ""
                  }`}
                >
                  {it.status === "done" ? "✓ " : ""}
                  {it.label}
                </div>
                {(it.start || it.note) && (
                  <div className="text-xs text-ink-soft tabular-nums">
                    {it.start && <bdi dir="ltr">{it.start}{it.end ? `–${clock(it.end)}` : ""}</bdi>}
                    {it.note ? `${it.start ? " · " : ""}${it.note}` : ""}
                  </div>
                )}
                {editable && it.kind === "study" && it.sessionKey && (
                  <div className="mt-1.5 flex gap-2 text-xs">
                    {it.status ? (
                      <button
                        type="button"
                        onClick={() =>
                          run(() => setSessionStatus(it.sessionKey!, null))
                        }
                        className="rounded-full border border-rule px-2.5 py-1 text-ink-soft hover:border-ink"
                      >
                        ביטול סימון
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            run(() =>
                              setSessionStatus(
                                it.sessionKey!,
                                "done",
                                it.minutes,
                              ),
                            )
                          }
                          className="rounded-full border border-rule px-2.5 py-1 hover:border-ink"
                        >
                          בוצע
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            run(() =>
                              setSessionStatus(it.sessionKey!, "skipped"),
                            )
                          }
                          className="rounded-full border border-rule px-2.5 py-1 text-ink-soft hover:border-ink"
                        >
                          דילוג
                        </button>
                      </>
                    )}
                    {it.study && !it.status && (
                      <button
                        type="button"
                        onClick={() => onEdit(it)}
                        className="inline-flex items-center gap-1 rounded-full border border-rule px-2.5 py-1 hover:border-ink"
                      >
                        <Icon name="pencil" className="size-3" />
                        {it.study.moved ? "הוזז · שינוי" : "שינוי זמן"}
                      </button>
                    )}
                  </div>
                )}
                {editable && it.routine?.mine && (
                  <div className="mt-1.5 flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onEdit(it)}
                      className="inline-flex items-center gap-1 rounded-full border border-rule px-2.5 py-1 hover:border-ink"
                    >
                      <Icon name="pencil" className="size-3" />
                      שינוי
                    </button>
                  </div>
                )}
                {editable && it.editable && it.eventId && (
                  <div className="mt-1.5 flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onEdit(it)}
                      className="inline-flex items-center gap-1 rounded-full border border-rule px-2.5 py-1 hover:border-ink"
                    >
                      <Icon name="pencil" className="size-3" />
                      עריכה
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        it.seriesId
                          ? onEdit(it)
                          : run(() => deleteEvent(it.eventId!))
                      }
                      className="rounded-full border border-rule px-2.5 py-1 text-ink-soft hover:border-ink"
                    >
                      מחיקה
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className="mt-5 border-t border-rule pt-4">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={onNew}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-bg"
            >
              <Icon name="plus" className="size-4" />
              אירוע חדש
            </button>
            {date >= today && (
              <button
                type="button"
                onClick={() =>
                  run(() => setDayOff(date, isOff ? null : "other"))
                }
                className="text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink"
              >
                {isOff ? "ביטול יום המנוחה" : "יום מנוחה / מילואים"}
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm">
              <span className="hl">{error}</span>
            </p>
          )}
        </div>
      )}
    </aside>
  );
}

/* ---------- Event editor (new event or one of mine) ---------- */

function EventEditor({
  state,
  people,
  repeatUntil,
  onClose,
  onDone,
}: {
  state: EditorState;
  people: { id: string; name: string }[];
  repeatUntil: string;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const item = state.mode === "edit" ? state.item : null;
  const inSeries = !!item?.seriesId;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(
    item?.date ?? (state.mode === "new" ? state.date : ""),
  );
  const [allDay, setAllDay] = useState(
    item ? !item.start : state.mode === "new" && !!state.allDay,
  );
  const [startT, setStartT] = useState(
    item?.start ??
      (state.mode === "new" && state.start ? state.start : "18:00"),
  );
  const [endT, setEndT] = useState(
    item?.end ?? (state.mode === "new" && state.end ? state.end : "19:00"),
  );
  const [freq, setFreq] = useState<
    "none" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly"
  >("none");
  const [days, setDays] = useState<number[]>([]);
  const [until, setUntil] = useState(repeatUntil);
  const [scope, setScope] = useState<"this" | "following" | "all">("this");
  const titleRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!item) titleRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [item]);

  const weekdayOf = (iso: string) =>
    iso ? new Date(iso + "T00:00:00Z").getUTCDay() : 0;
  const pickedDays = days.length ? days : [weekdayOf(date)];

  // Changing the start keeps the length, like Google Calendar.
  const changeStart = (v: string) => {
    if (v && startT && endT) {
      const len = toMin(endT) - toMin(startT);
      setEndT(hhmm(Math.min(toMin(v) + Math.max(len, SNAP), 24 * 60 - 1)));
    }
    setStartT(v);
  };

  const repeat: Repeat | null =
    freq === "none"
      ? null
      : freq === "weekly" || freq === "biweekly"
        ? {
            freq: "weekly",
            every: freq === "biweekly" ? 2 : 1,
            days: pickedDays,
            until,
          }
        : { freq, until };

  const run = (fn: () => Promise<void>, done: string) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        onDone(done);
        onClose();
      } catch (e) {
        setError((e as Error).message || "השמירה נכשלה. נסו שוב.");
      }
    });

  const scopeWord =
    scope === "all"
      ? " (כל הסדרה)"
      : scope === "following"
        ? " (מכאן והלאה)"
        : "";
  const field = "rounded-lg border border-rule bg-surface px-2 py-1.5";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-editor-title"
        className={`panel max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-b-none p-5 sm:rounded-b-[inherit] ${pending ? "opacity-70" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const title = String(f.get("title") ?? "");
          const location = String(f.get("location") ?? "");
          const blocks = !allDay && f.get("blocks") === "on";
          if (!allDay && endT <= startT)
            return setError("שעת הסיום צריכה להיות אחרי שעת ההתחלה");
          if (repeat && until <= date)
            return setError(
              "תאריך הסיום של החזרה צריך להיות אחרי תאריך האירוע",
            );
          const times = allDay
            ? { allDay: true }
            : { allDay: false, start: startT, end: endT };
          if (item)
            run(
              () =>
                updateEvent({
                  id: item.eventId!,
                  title,
                  date,
                  ...times,
                  location,
                  blocks,
                  scope,
                  repeat: inSeries ? null : repeat,
                }),
              `האירוע עודכן${scopeWord}`,
            );
          else
            run(
              () =>
                addEvent({
                  title,
                  date,
                  ...times,
                  location,
                  blocks,
                  repeat,
                  invite: f.getAll("invite").map(String),
                }),
              repeat ? "האירועים החוזרים נוספו" : "האירוע נוסף",
            );
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="event-editor-title" className="section-title">
            {item ? "עריכת אירוע" : "אירוע חדש"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="rounded-lg p-1.5 text-ink-soft hover:bg-bg hover:text-ink"
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>

        <input
          ref={titleRef}
          name="title"
          required
          maxLength={200}
          defaultValue={item?.title ?? ""}
          placeholder="הוספת כותרת"
          aria-label="כותרת"
          className="mt-4 w-full border-b-2 border-rule bg-transparent pb-1.5 text-lg outline-none focus:border-ink"
        />

        <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3 text-sm">
          <Icon
            name="calendar"
            className="size-4 self-start mt-2 text-ink-soft"
          />
          <div className="flex flex-col items-start gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="date"
                required
                dir="ltr"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="תאריך"
                className={field}
              />
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  className="size-4"
                />
                כל היום
              </label>
            </div>
            {!allDay && (
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  required
                  step={300}
                  dir="ltr"
                  value={startT}
                  onChange={(e) => changeStart(e.target.value)}
                  aria-label="שעת התחלה"
                  className={field}
                />
                <span className="text-ink-soft">עד</span>
                <input
                  type="time"
                  required
                  step={300}
                  dir="ltr"
                  value={endT}
                  onChange={(e) => setEndT(e.target.value)}
                  aria-label="שעת סיום"
                  className={field}
                />
              </div>
            )}
          </div>

          <Icon
            name="repeat"
            className="size-4 self-start mt-2 text-ink-soft"
          />
          {inSeries ? (
            <p className="py-1.5 text-ink-soft">
              {item!.repeat ? describeRepeat(item!.repeat) : "אירוע חוזר"}
            </p>
          ) : (
            <div className="flex flex-col items-start gap-2">
              <select
                value={freq}
                onChange={(e) => setFreq(e.target.value as typeof freq)}
                aria-label="חזרה"
                className={field}
              >
                <option value="none">לא חוזר</option>
                <option value="daily">כל יום</option>
                <option value="weekdays">בימים א׳–ה׳</option>
                <option value="weekly">כל שבוע</option>
                <option value="biweekly">כל שבועיים</option>
                <option value="monthly">
                  כל חודש (ב־{date ? Number(date.slice(8)) : "…"} בחודש)
                </option>
              </select>
              {(freq === "weekly" || freq === "biweekly") && (
                <div
                  className="flex gap-1"
                  role="group"
                  aria-label="ימים בשבוע"
                >
                  {["א", "ב", "ג", "ד", "ה", "ו", "ש"].map((l, d) => {
                    const on = pickedDays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setDays(
                            on
                              ? pickedDays.filter((x) => x !== d)
                              : [...pickedDays, d].sort(),
                          )
                        }
                        className={`grid size-11 place-items-center rounded-full border text-sm sm:size-9 sm:text-xs ${on ? "border-accent bg-accent text-on-accent" : "border-rule-strong text-ink-soft hover:border-ink"}`}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
              )}
              {freq !== "none" && (
                <label className="flex items-center gap-2">
                  <span className="text-ink-soft">עד</span>
                  <input
                    type="date"
                    required
                    dir="ltr"
                    value={until}
                    min={date}
                    onChange={(e) => setUntil(e.target.value)}
                    aria-label="חוזר עד"
                    className={field}
                  />
                </label>
              )}
            </div>
          )}

          <Icon name="pin" className="size-4 text-ink-soft" />
          <input
            name="location"
            maxLength={200}
            defaultValue={item?.location ?? ""}
            placeholder="מיקום או קישור (לא חובה)"
            aria-label="מיקום"
            className="w-full rounded-lg border border-rule bg-surface px-3 py-1.5"
          />

          {!allDay && (
            <>
              <Icon name="cap" className="size-4 text-ink-soft" />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="blocks"
                  defaultChecked={item?.blocks ?? true}
                  className="size-4"
                />
                לא לשבץ לימוד בזמן הזה
              </label>
            </>
          )}

          {!item && people.length > 0 && (
            <>
              <Icon name="users" className="size-4 self-start text-ink-soft" />
              <fieldset>
                <legend className="text-ink-soft">להזמין</legend>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {people.map((p) => (
                    <label key={p.id} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        name="invite"
                        value={p.id}
                        className="size-4"
                      />
                      {p.name.split(" ")[0]}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
        </div>

        {inSeries && (
          <fieldset className="mt-4 rounded-lg border border-rule p-3 text-sm">
            <legend className="px-1 text-ink-soft">
              השינוי או המחיקה חלים על
            </legend>
            <div className="flex flex-col gap-1.5">
              {(
                [
                  ["this", "רק האירוע הזה"],
                  ["following", "האירוע הזה וכל הבאים"],
                  ["all", "כל האירועים בסדרה"],
                ] as const
              ).map(([v, l]) => (
                <label key={v} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="scope"
                    checked={scope === v}
                    onChange={() => setScope(v)}
                    className="size-4"
                  />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {allDay && (
          <p className="mt-3 text-xs text-ink-soft">
            אירוע של כל היום לא עוצר את תוכנית הלימוד. ליום בלי לימוד יש ״יום
            מנוחה״.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm">
            <span className="hl">{error}</span>
          </p>
        )}

        <div className="mt-5 flex items-center gap-2">
          {item && (
            <button
              type="button"
              onClick={() =>
                run(() => deleteEvent(item.eventId!, scope), `נמחק${scopeWord}`)
              }
              className="me-auto rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-bg hover:text-ink"
            >
              מחיקה
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`${item ? "" : "ms-auto"} rounded-lg px-3 py-2 text-sm text-ink-soft hover:text-ink`}
          >
            ביטול
          </button>
          <button
            disabled={pending}
            className="rounded-lg bg-ink px-5 py-2 text-sm font-medium text-bg"
          >
            שמירה
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Routine occurrence editor (this time / the whole routine) ---------- */

function RoutineEditor({ item, onClose, onDone }: { item: CalItem; onClose: () => void; onDone: (text: string) => void }) {
  const r = item.routine!;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(item.date);
  const [startT, setStartT] = useState(item.start ?? "09:00");
  const [endT, setEndT] = useState(item.end ? clock(item.end) : "09:30");
  const [scope, setScope] = useState<"once" | "all">("once");
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  const toEnd = (t: string) => (t === "00:00" ? 24 * 60 : toMin(t));
  const minutes = toEnd(endT) - toMin(startT);
  const changeStart = (v: string) => {
    if (v) setEndT(clock(hhmm(Math.min(toMin(v) + Math.max(minutes, SNAP), 24 * 60)).replace("24:00", "00:00")));
    setStartT(v);
  };
  const day = r.flexible ? item.date : r.key; // the key a one-off change is stored under

  const run = (fn: () => Promise<void>, done: string) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        onDone(done);
        onClose();
      } catch (e) {
        setError((e as Error).message || "השמירה נכשלה. נסו שוב.");
      }
    });

  const save = () => {
    if (minutes < 5) return setError("שעת הסיום צריכה להיות אחרי שעת ההתחלה");
    if (scope === "all")
      return run(
        () => setRoutineTiming(r.id, r.flexible ? { minutes } : { start: startT, minutes }, r.flexible ? undefined : r.key),
        r.flexible ? "משך השגרה עודכן" : "השגרה עודכנה מעכשיו והלאה",
      );
    run(async () => {
      if (r.flexible) {
        await setRoutineOccurrence(r.id, date, { start: startT, minutes });
        if (date !== item.date) await setRoutineOccurrence(r.id, item.date, { skip: true });
      } else await setRoutineOccurrence(r.id, r.key, { start: startT, minutes, ...(date !== r.key && { date }) });
    }, "השתנה רק הפעם");
  };

  const field = "rounded-lg border border-rule bg-surface px-2 py-1.5";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center sm:p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="routine-editor-title"
        className={`panel max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-b-none p-5 sm:rounded-b-[inherit] ${pending ? "opacity-70" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="routine-editor-title" className="section-title">
            {item.label}
          </h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="rounded-lg p-1.5 text-ink-soft hover:bg-bg hover:text-ink">
            <Icon name="close" className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          {r.flexible ? "שגרה גמישה: משובצת בזמן פנוי לפי היעד השבועי." : "שגרה קבועה."}
          {r.moved ? " המופע הזה כבר שונה." : ""}
        </p>

        <fieldset className="mt-4 flex rounded-lg border border-rule p-0.5 text-sm">
          <legend className="sr-only">על מה השינוי חל</legend>
          {(
            [
              ["once", "רק הפעם"],
              ["all", "כל השגרה"],
            ] as const
          ).map(([v, l]) => (
            <label key={v} className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-center ${scope === v ? "bg-accent text-on-accent" : "text-ink-soft hover:text-ink"}`}>
              <input type="radio" name="scope" value={v} checked={scope === v} onChange={() => setScope(v)} className="sr-only" />
              {l}
            </label>
          ))}
        </fieldset>

        <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3 text-sm">
          <Icon name="calendar" className="size-4 text-ink-soft" />
          <div className="flex flex-col items-start gap-2">
            {scope === "once" && (
              <input
                type="date"
                required
                dir="ltr"
                value={date}
                min={addDays(day, -6)}
                max={addDays(day, 6)}
                onChange={(e) => setDate(e.target.value)}
                aria-label="תאריך"
                className={field}
              />
            )}
            <div className="flex items-center gap-2">
              <input type="time" required step={300} dir="ltr" value={startT} onChange={(e) => changeStart(e.target.value)} aria-label="שעת התחלה" disabled={scope === "all" && r.flexible} className={`${field} disabled:opacity-50`} />
              <span className="text-ink-soft">עד</span>
              <input type="time" required step={300} dir="ltr" value={endT} onChange={(e) => setEndT(e.target.value)} aria-label="שעת סיום" className={field} />
            </div>
          </div>
        </div>
        {scope === "all" && (
          <p className="mt-3 text-xs text-ink-soft">
            {r.flexible
              ? "בשגרה גמישה משתנה המשך בכל הפעמים. השעה נקבעת כל פעם לפי הזמן הפנוי."
              : "השעה והמשך ישתנו בכל הימים של השגרה. ימים, אימוג׳י ושאר ההגדרות בדף השגרות."}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm">
            <span className="hl">{error}</span>
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {scope === "once" && (
            <button type="button" onClick={() => run(() => setRoutineOccurrence(r.id, day, { skip: true }), "דילגת על הפעם הזו")} className="rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-bg hover:text-ink">
              דילוג הפעם
            </button>
          )}
          {scope === "once" && r.moved && (
            <button type="button" onClick={() => run(() => setRoutineOccurrence(r.id, day, null), "חזר לזמן הרגיל")} className="rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-bg hover:text-ink">
              החזרה לרגיל
            </button>
          )}
          {scope === "all" && (
            <a href="/routines" className="rounded-lg px-3 py-2 text-sm text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
              כל ההגדרות
            </a>
          )}
          <button type="button" onClick={onClose} className="ms-auto rounded-lg px-3 py-2 text-sm text-ink-soft hover:text-ink">
            ביטול
          </button>
          <button disabled={pending} className="rounded-lg bg-ink px-5 py-2 text-sm font-medium text-bg">
            שמירה
          </button>
        </div>
      </form>
    </div>
  );
}

function Chip({
  item,
  onClick,
}: {
  item: CalItem;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const base =
    "block w-full truncate rounded px-1.5 py-0.5 text-start text-[11px] leading-tight";
  if (item.kind === "exam")
    return (
      <span
        onClick={onClick}
        className={`${base} font-semibold text-white`}
        style={{ background: item.color }}
      >
        {item.label}
      </span>
    );
  if (item.kind === "academic")
    return (
      <span onClick={onClick} className={`${base} bg-rule/70 text-ink-soft`}>
        {item.label}
      </span>
    );
  return (
    <span
      onClick={onClick}
      className={`${base} ${item.done ? "line-through opacity-60" : ""}`}
      style={{
        background: `color-mix(in srgb, ${item.color} 14%, transparent)`,
        borderInlineStart: `3px solid ${item.color}`,
      }}
    >
      {item.label}
    </span>
  );
}

