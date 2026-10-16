"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addEvent, deleteEvent, setSessionStatus } from "@/app/actions";

export type CalKind = "due" | "exam" | "study" | "event" | "tutorial" | "academic";

export interface CalItem {
  date: string; // YYYY-MM-DD
  kind: CalKind;
  color: string;
  label: string;
  start?: string; // "18:00"
  end?: string;
  minutes?: number;
  done?: boolean;
  sessionKey?: string;
  status?: "done" | "skipped";
  eventId?: string;
  deletable?: boolean;
  holiday?: boolean;
}

const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: "UTC", ...o }).format(new Date(iso + "T00:00:00Z"));
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekStart = (iso: string) => addDays(iso, -new Date(iso + "T00:00:00Z").getUTCDay());
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const timed = (i: CalItem) => !!(i.start && i.end);

function daysOfMonth(ym: string): (string | null)[] {
  const first = ym + "-01";
  const cells: (string | null)[] = Array(new Date(first + "T00:00:00Z").getUTCDay()).fill(null);
  for (let d = first; d.startsWith(ym); d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

const rank: Record<CalKind, number> = { academic: 0, exam: 1, due: 2, tutorial: 3, event: 4, study: 5 };
const order = (a: CalItem, b: CalItem) => rank[a.kind] - rank[b.kind] || (a.start ?? "").localeCompare(b.start ?? "");

export function SemesterCalendar({
  items,
  today,
  legend,
  editable,
}: {
  items: CalItem[];
  today: string;
  legend: { color: string; label: string }[];
  editable: boolean;
}) {
  const byDate = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const it of items) {
      if (!m.has(it.date)) m.set(it.date, []);
      m.get(it.date)!.push(it);
    }
    for (const l of m.values()) l.sort(order);
    return m;
  }, [items]);

  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(today); // any day inside the shown week / month
  const [selected, setSelected] = useState(today);

  const move = (dir: 1 | -1) => {
    if (view === "week") {
      const next = addDays(weekStart(anchor), dir * 7);
      setAnchor(next);
      setSelected(next <= today && today < addDays(next, 7) ? today : next);
    } else {
      const [y, m] = anchor.slice(0, 7).split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10);
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

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="panel min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-rule px-3 py-3 sm:px-5">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => move(-1)} className="rounded-lg px-2.5 py-1.5 text-ink-soft hover:bg-bg" aria-label="הקודם">
              →
            </button>
            <button type="button" onClick={() => move(1)} className="rounded-lg px-2.5 py-1.5 text-ink-soft hover:bg-bg" aria-label="הבא">
              ←
            </button>
          </div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={goToday}
            className="rounded-full border border-rule px-3 py-1 text-sm text-ink-soft hover:border-ink hover:text-ink"
          >
            היום
          </button>
          <div className="ms-auto flex rounded-lg border border-rule p-0.5 text-sm" role="tablist" aria-label="תצוגה">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 ${view === v ? "bg-ink text-bg" : "text-ink-soft hover:text-ink"}`}
              >
                {v === "week" ? "שבוע" : "חודש"}
              </button>
            ))}
          </div>
        </div>

        {view === "month" ? (
          <MonthGrid month={anchor.slice(0, 7)} byDate={byDate} today={today} selected={selected} onSelect={setSelected} />
        ) : (
          <WeekGrid start={weekStart(anchor)} byDate={byDate} today={today} selected={selected} onSelect={setSelected} />
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-rule px-4 py-3 text-xs text-ink-soft sm:px-5">
          {legend.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-ink-soft" />
            לוח אקדמי ואירועים
          </span>
        </div>
      </div>

      <DayPanel date={selected} items={byDate.get(selected) ?? []} editable={editable} />
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
          if (!d) return <div key={`e${i}`} className={`border-b border-e border-rule bg-bg/40 ${edge}`} />;
          const list = byDate.get(d) ?? [];
          const marks = list.filter((x) => x.kind !== "study");
          const study = list.filter((x) => x.kind === "study" && x.status !== "skipped");
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
                d === selected ? "bg-bg" : holiday ? "bg-bg/50 hover:bg-bg" : "hover:bg-bg/60"
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
                {studyMin > 0 && (
                  <span className="flex items-center gap-1 whitespace-nowrap px-1 text-[11px] text-ink-soft">
                    {study.map((s, k) => (
                      <span key={k} className="size-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                    ))}
                    <span className="truncate">לימוד {hours(studyMin)}</span>
                  </span>
                )}
              </span>
              <span className="flex flex-wrap gap-0.5 px-0.5 md:hidden">
                {marks.map((m, k) => (
                  <span
                    key={k}
                    className={m.kind === "exam" ? "h-1.5 w-3 rounded-full" : "size-1.5 rounded-full"}
                    style={{ background: m.done ? "transparent" : m.color, border: `1.5px solid ${m.color}` }}
                  />
                ))}
                {studyMin > 0 && <span className="h-0.5 w-full rounded bg-rule" />}
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

function WeekGrid({
  start,
  byDate,
  today,
  selected,
  onSelect,
}: {
  start: string;
  byDate: Map<string, CalItem[]>;
  today: string;
  selected: string;
  onSelect: (d: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const all = days.flatMap((d) => byDate.get(d) ?? []);
  const timedItems = all.filter(timed);
  const minH = Math.min(8, ...timedItems.map((i) => Math.floor(toMin(i.start!) / 60)));
  const maxH = Math.max(22, ...timedItems.map((i) => Math.ceil(toMin(i.end!) / 60)));
  const hoursList = Array.from({ length: maxH - minH }, (_, i) => minH + i);
  const scroller = useRef<HTMLDivElement>(null);
  const firstStudy = Math.min(...timedItems.map((i) => toMin(i.start!)), 17 * 60);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, ((firstStudy - minH * 60) / 60 - 0.5) * HOUR_PX);
  }, [start, firstStudy, minH]);

  return (
    <>
      {/* Phone: one row per day */}
      <ol className="divide-y divide-rule md:hidden">
        {days.map((d) => {
          const list = byDate.get(d) ?? [];
          return (
            <li key={d}>
              <button
                type="button"
                onClick={() => onSelect(d)}
                className={`flex w-full gap-3 px-4 py-3 text-start ${d === selected ? "bg-bg" : ""}`}
              >
                <span className="w-12 shrink-0 leading-tight">
                  <span className={`block text-xs ${d === today ? "font-semibold text-ink" : "text-ink-soft"}`}>
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
                  {list.length === 0 && <span className="pt-1 text-sm text-ink-soft">פנוי</span>}
                  {list.map((it, k) => (
                    <span key={k} className="flex items-center gap-2 text-sm">
                      <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: it.color }} />
                      <span
                        className={`min-w-0 flex-1 truncate ${it.status === "skipped" || it.done ? "line-through text-ink-soft" : ""} ${
                          it.kind === "exam" ? "font-semibold" : ""
                        }`}
                      >
                        {it.status === "done" ? "✓ " : ""}
                        {it.label}
                      </span>
                      {it.start && <span className="shrink-0 tabular-nums text-xs text-ink-soft">{it.start}</span>}
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
              <div className="text-xs text-ink-soft">{fmt(d, { weekday: "short" })}</div>
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
          <div className="py-1.5 text-center text-[11px] text-ink-soft">כל היום</div>
          {days.map((d) => (
            <div key={d} className="flex min-h-9 flex-col gap-1 border-s border-rule p-1">
              {(byDate.get(d) ?? []).filter((x) => !timed(x)).map((it, k) => (
                <Chip key={k} item={it} onClick={() => onSelect(d)} />
              ))}
            </div>
          ))}
        </div>

        <div ref={scroller} className="max-h-[34rem] overflow-y-auto pt-2">
          <div className="relative grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
            <div>
              {hoursList.map((h) => (
                <div key={h} className="relative text-center text-[11px] text-ink-soft tabular-nums" style={{ height: HOUR_PX }}>
                  <span className="relative -top-2">{String(h).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>
            {days.map((d) => (
              <div
                key={d}
                className={`relative border-s border-rule ${d === selected ? "bg-bg/60" : ""}`}
                onClick={() => onSelect(d)}
              >
                {hoursList.map((h) => (
                  <div key={h} className="border-t border-rule/70" style={{ height: HOUR_PX }} />
                ))}
                {(byDate.get(d) ?? []).filter(timed).map((it, k) => {
                  const top = ((toMin(it.start!) - minH * 60) / 60) * HOUR_PX;
                  const height = Math.max(20, ((toMin(it.end!) - toMin(it.start!)) / 60) * HOUR_PX - 2);
                  const faded = it.status === "skipped";
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(d);
                      }}
                      className={`absolute inset-x-1 overflow-hidden rounded-md px-1.5 py-1 text-start text-[11px] leading-tight ${
                        faded ? "opacity-40" : ""
                      }`}
                      style={{
                        top,
                        height,
                        background:
                          it.kind === "study"
                            ? `color-mix(in srgb, ${it.color} 16%, var(--surface))`
                            : `color-mix(in srgb, ${it.color} 85%, black)`,
                        color: it.kind === "study" ? "var(--ink)" : "white",
                        borderInlineStart: `3px solid ${it.color}`,
                      }}
                    >
                      <span className={`block font-medium ${faded ? "line-through" : ""}`}>
                        {it.status === "done" ? "✓ " : ""}
                        {it.label}
                      </span>
                      <span className="block opacity-75 tabular-nums">
                        {it.start}–{it.end}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- Day panel (details + planner actions) ---------- */

function DayPanel({ date, items, editable }: { date: string; items: CalItem[]; editable: boolean }) {
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch {
        setError("השמירה נכשלה. נסו שוב.");
      }
    });

  return (
    <aside className={`panel self-start p-5 ${pending ? "opacity-70" : ""}`} aria-live="polite">
      <h3 className="font-semibold">{fmt(date, { weekday: "long", day: "numeric", month: "long" })}</h3>

      {items.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">אין הגשות, בחינות או לימוד מתוכנן.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((it, k) => (
            <li key={k} className="flex gap-3">
              <span className="mt-1 h-4 w-1 shrink-0 rounded-full" style={{ background: it.color }} />
              <div className="min-w-0 flex-1">
                <div
                  className={`${it.done || it.status === "skipped" ? "line-through text-ink-soft" : ""} ${
                    it.kind === "exam" ? "font-semibold" : ""
                  }`}
                >
                  {it.status === "done" ? "✓ " : ""}
                  {it.label}
                </div>
                {it.start && (
                  <div className="text-xs text-ink-soft tabular-nums">
                    {it.start}
                    {it.end ? `–${it.end}` : ""}
                  </div>
                )}
                {editable && it.kind === "study" && it.sessionKey && (
                  <div className="mt-1.5 flex gap-2 text-xs">
                    {it.status ? (
                      <button
                        type="button"
                        onClick={() => run(() => setSessionStatus(it.sessionKey!, null))}
                        className="rounded-full border border-rule px-2.5 py-1 text-ink-soft hover:border-ink"
                      >
                        ביטול סימון
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => run(() => setSessionStatus(it.sessionKey!, "done", it.minutes))}
                          className="rounded-full border border-rule px-2.5 py-1 hover:border-ink"
                        >
                          בוצע
                        </button>
                        <button
                          type="button"
                          onClick={() => run(() => setSessionStatus(it.sessionKey!, "skipped"))}
                          className="rounded-full border border-rule px-2.5 py-1 text-ink-soft hover:border-ink"
                        >
                          דילוג
                        </button>
                      </>
                    )}
                  </div>
                )}
                {editable && it.deletable && it.eventId && (
                  <button
                    type="button"
                    onClick={() => run(() => deleteEvent(it.eventId!))}
                    className="mt-1 text-xs text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink"
                  >
                    מחיקה
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className="mt-5 border-t border-rule pt-4">
          {adding ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(async () => {
                  await addEvent({
                    date,
                    title: String(f.get("title") ?? ""),
                    start: String(f.get("start") ?? ""),
                    end: String(f.get("end") ?? ""),
                  });
                  setAdding(false);
                });
              }}
            >
              <input
                name="title"
                required
                maxLength={200}
                placeholder="מה מתוכנן? (עבודה, אימון, מפגש…)"
                className="w-full rounded-lg border border-rule bg-surface px-3 py-2"
                aria-label="שם האירוע"
              />
              <div className="flex items-center gap-2 text-sm">
                <input name="start" type="time" required defaultValue="18:00" dir="ltr" className="rounded-lg border border-rule bg-surface px-2 py-1.5" aria-label="שעת התחלה" />
                <span className="text-ink-soft">עד</span>
                <input name="end" type="time" required defaultValue="19:00" dir="ltr" className="rounded-lg border border-rule bg-surface px-2 py-1.5" aria-label="שעת סיום" />
              </div>
              <div className="flex gap-2">
                <button className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg">הוספה</button>
                <button type="button" onClick={() => setAdding(false)} className="px-3 py-2 text-sm text-ink-soft">
                  ביטול
                </button>
              </div>
              <p className="text-xs text-ink-soft">התוכנית לא תשבץ לימוד בזמן הזה.</p>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink"
            >
              הוספת אירוע ליום הזה
            </button>
          )}
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

function Chip({ item, onClick }: { item: CalItem; onClick?: () => void }) {
  const base = "block w-full rounded px-1.5 py-0.5 text-start text-[11px] leading-tight";
  if (item.kind === "exam")
    return (
      <span onClick={onClick} className={`${base} font-semibold text-white`} style={{ background: item.color }}>
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

function hours(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}${m ? `:${String(m).padStart(2, "0")}` : ""} ש׳` : `${m} דק׳`;
}
