"use client";

import { useMemo, useState } from "react";

export interface CalItem {
  date: string; // YYYY-MM-DD
  kind: "due" | "exam" | "study";
  color: string;
  label: string; // shown in the cell / details
  time?: string; // "18:00–19:30" for study sessions and timed exams
  minutes?: number;
  done?: boolean;
}

const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const monthName = (ym: string) =>
  new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(ym + "-01T00:00:00Z"),
  );
const dayLong = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(iso + "T00:00:00Z"),
  );

function daysOfMonth(ym: string): (string | null)[] {
  const first = new Date(ym + "-01T00:00:00Z");
  const lead = first.getUTCDay();
  const cells: (string | null)[] = Array(lead).fill(null);
  const d = new Date(first);
  while (d.getUTCMonth() === first.getUTCMonth()) {
    cells.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

function studyLabel(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}${m ? `:${String(m).padStart(2, "0")}` : ""} ש׳` : `${m} דק׳`;
}

export function SemesterCalendar({
  items,
  months,
  today,
  legend,
}: {
  items: CalItem[];
  months: string[];
  today: string;
  legend: { color: string; label: string }[];
}) {
  const byDate = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const it of items) {
      if (!m.has(it.date)) m.set(it.date, []);
      m.get(it.date)!.push(it);
    }
    return m;
  }, [items]);

  const startIdx = Math.max(0, months.indexOf(today.slice(0, 7)));
  const [idx, setIdx] = useState(startIdx);
  const month = months[idx];
  const [selected, setSelected] = useState<string>(
    today.slice(0, 7) === month ? today : (items.find((i) => i.date.startsWith(month))?.date ?? month + "-01"),
  );

  const go = (n: number) => {
    const next = Math.min(months.length - 1, Math.max(0, idx + n));
    setIdx(next);
    const m = months[next];
    setSelected(
      today.startsWith(m)
        ? today
        : (items.find((i) => i.date.startsWith(m) && i.kind !== "study")?.date ?? m + "-01"),
    );
  };

  const selectedItems = (byDate.get(selected) ?? []).slice().sort(order);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-rule px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={idx === 0}
            className="rounded-lg px-3 py-1.5 text-ink-soft hover:bg-bg disabled:opacity-30"
            aria-label="החודש הקודם"
          >
            →
          </button>
          <h2 className="text-lg font-semibold">{monthName(month)}</h2>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={idx === months.length - 1}
            className="rounded-lg px-3 py-1.5 text-ink-soft hover:bg-bg disabled:opacity-30"
            aria-label="החודש הבא"
          >
            ←
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-rule text-center text-xs text-ink-soft">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {daysOfMonth(month).map((d, i) => {
            if (!d) return <div key={`e${i}`} className="border-b border-e border-rule bg-bg/40 last:border-e-0" />;
            const list = (byDate.get(d) ?? []).slice().sort(order);
            const marks = list.filter((x) => x.kind !== "study");
            const study = list.filter((x) => x.kind === "study");
            const studyMin = study.reduce((s, x) => s + (x.minutes ?? 0), 0);
            const isToday = d === today;
            const isSel = d === selected;
            const past = d < today;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelected(d)}
                aria-pressed={isSel}
                aria-label={`${dayLong(d)}${marks.length ? `, ${marks.map((m) => m.label).join(", ")}` : ""}`}
                className={`relative flex min-h-14 flex-col items-stretch gap-1 border-b border-e border-rule p-1 text-start transition-colors md:min-h-28 md:p-1.5 ${
                  (i + 1) % 7 === 0 ? "border-e-0" : ""
                } ${isSel ? "bg-bg" : "hover:bg-bg/60"} ${past ? "text-ink-soft" : ""}`}
              >
                <span
                  className={`grid size-6 place-items-center self-start rounded-full text-xs tabular-nums md:text-[13px] ${
                    isToday ? "bg-ink font-semibold text-bg" : ""
                  }`}
                >
                  {Number(d.slice(8))}
                </span>

                {/* PC: labelled chips */}
                <span className="hidden flex-col gap-1 md:flex">
                  {marks.map((m, k) => (
                    <Chip key={k} item={m} />
                  ))}
                  {studyMin > 0 && (
                    <span className="flex items-center gap-1 whitespace-nowrap px-1 text-[11px] text-ink-soft">
                      {study.map((s, k) => (
                        <span key={k} className="size-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                      ))}
                      <span className="truncate">לימוד {studyLabel(studyMin)}</span>
                    </span>
                  )}
                </span>

                {/* Phone: coloured marks only */}
                <span className="flex flex-wrap gap-0.5 px-0.5 md:hidden">
                  {marks.map((m, k) =>
                    m.kind === "exam" ? (
                      <span key={k} className="h-1.5 w-3 rounded-full" style={{ background: m.color }} />
                    ) : (
                      <span
                        key={k}
                        className="size-1.5 rounded-full"
                        style={{ background: m.done ? "transparent" : m.color, border: `1.5px solid ${m.color}` }}
                      />
                    ),
                  )}
                  {studyMin > 0 && <span className="h-0.5 w-full rounded bg-rule" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-xs text-ink-soft sm:px-5">
          {legend.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      <aside className="panel self-start p-5" aria-live="polite">
        <h3 className="font-semibold">{dayLong(selected)}</h3>
        {selectedItems.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">אין הגשות, בחינות או לימוד מתוכנן.</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {selectedItems.map((it, k) => (
              <li key={k} className="flex gap-3">
                <span className="mt-1 h-4 w-1 shrink-0 rounded-full" style={{ background: it.color }} />
                <div className="min-w-0">
                  <div className={`${it.done ? "line-through text-ink-soft" : ""} ${it.kind === "exam" ? "font-semibold" : ""}`}>
                    {it.label}
                  </div>
                  {it.time && <div className="text-xs text-ink-soft tabular-nums" dir="ltr" style={{ textAlign: "right" }}>{it.time}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function Chip({ item }: { item: CalItem }) {
  if (item.kind === "exam")
    return (
      <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold leading-tight text-white" style={{ background: item.color }}>
        {item.label}
      </span>
    );
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] leading-tight ${item.done ? "line-through opacity-60" : ""}`}
      style={{
        background: `color-mix(in srgb, ${item.color} 14%, transparent)`,
        color: "var(--ink)",
        borderInlineStart: `3px solid ${item.color}`,
      }}
    >
      {item.label}
    </span>
  );
}

const rank = { exam: 0, due: 1, study: 2 } as const;
function order(a: CalItem, b: CalItem) {
  return rank[a.kind] - rank[b.kind] || (a.time ?? "").localeCompare(b.time ?? "");
}
