"use client";

import { useState } from "react";
import { addDays } from "@/lib/semester";
import { expectedShare, paceStatus, type Now, type PacePoint } from "@/lib/pace";

const DAY = 86_400_000;
/** Midnight of an Israeli date, close enough for a chart (the hour's offset doesn't move a pixel). */
const dayMs = (d: string) => Date.parse(`${d}T00:00:00+02:00`);
const short = (d: string) => `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}`;

export function israelNow(): Now {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/**
 * The assignment's timeline: parts with answers over time (a step line in the course colour)
 * against a steady line across the prep window (dashed), with today and the deadline marked.
 */
export function PaceChart({
  points,
  answered,
  total,
  window: win,
  due,
  color,
}: {
  points: PacePoint[];
  answered: number;
  total: number;
  window: { start: string; target: string };
  due: string;
  color: string;
}) {
  // the moment the panel opened: a chart doesn't need to tick
  const [{ now, nowMs }] = useState(() => ({ now: israelNow(), nowMs: Date.now() }));
  const share = expectedShare(win, now);
  const { status, gap } = paceStatus(answered, total, share);

  const W = 320;
  const H = 96;
  const L = 22;
  const R = 8;
  const T = 8;
  const B = 18;
  const x0 = dayMs(win.start);
  const x1 = dayMs(due) + DAY;
  const x = (ms: number) => L + ((Math.min(Math.max(ms, x0), x1) - x0) / (x1 - x0)) * (W - L - R);
  const y = (v: number) => T + (1 - v / Math.max(total, 1)) * (H - T - B);

  // the steady line: 0 at the window's start, everything by the end of the target day, then flat
  const target = dayMs(addDays(win.target, 1));
  const expected = `M${x(x0)},${y(0)} L${x(target)},${y(total)} L${x(x1)},${y(total)}`;

  // my line: from the first recorded point (before it Unihub didn't know, so nothing is drawn),
  // a step at each change, then on to now with the current count
  const pts = points.filter((p) => p.total === total).map((p) => ({ ms: Date.parse(p.at), v: p.answered }));
  const end = Math.min(nowMs, x1);
  const first = pts[0] ?? { ms: end, v: answered };
  let path = `M${x(first.ms).toFixed(1)},${y(first.v).toFixed(1)}`;
  let last = first.v;
  for (const p of pts.slice(1)) {
    path += ` H${x(p.ms).toFixed(1)} V${y(p.v).toFixed(1)}`;
    last = p.v;
  }
  path += ` H${x(end).toFixed(1)}`;
  if (answered !== last) path += ` V${y(answered).toFixed(1)}`;

  const parts = (k: number) => (k === 1 ? "סעיף אחד" : `${k} סעיפים`);
  const text =
    status === "done"
      ? "לכל הסעיפים יש תשובה."
      : now.date < win.start && answered === 0
        ? `חלון ההכנה מתחיל ב־${short(win.start)}.`
        : status === "behind"
          ? `מאחור ב${parts(gap)} לעומת הקו. כדאי לפנות לזה זמן היום.`
          : status === "ahead"
            ? `לפני הקצב ב${parts(-gap)}.`
            : "בקצב.";

  return (
    <div>
      <p className={status === "behind" ? "hl" : ""}>
        {text} <span className="text-ink-soft">{answered}/{total} עכשיו.</span>
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full max-w-md text-ink-soft"
        role="img"
        aria-label={`התקדמות: ${answered} מתוך ${total} סעיפים עם תשובה. לפי קו קבוע מ־${short(win.start)} עד ${short(win.target)} היו צריכים להיות ${Math.round(share * total)}.`}
        style={{ direction: "ltr" }}
      >
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.35} />
        <path d={expected} fill="none" stroke="currentColor" strokeDasharray="3 3" strokeWidth={1.25} />
        {nowMs > x0 && nowMs < x1 && <line x1={x(nowMs)} x2={x(nowMs)} y1={T - 4} y2={y(0)} stroke="currentColor" strokeOpacity={0.5} />}
        <path d={path} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" />
        <circle cx={x(end)} cy={y(answered)} r={3} fill={color} />
        <text x={L - 4} y={y(total) + 3} textAnchor="end" fontSize={9} fill="currentColor">{total}</text>
        <text x={L - 4} y={y(0) + 3} textAnchor="end" fontSize={9} fill="currentColor">0</text>
        <text x={x(x0)} y={H - 4} fontSize={9} fill="currentColor">{short(win.start)}</text>
        <text x={x(x1)} y={H - 4} textAnchor="end" fontSize={9} fill="currentColor">הגשה {short(due)}</text>
      </svg>
      <p className="mt-1 text-xs text-ink-soft">הקו המקווקו: התקדמות קבועה עד יום לפני ההגשה. הקו הצבעוני: הסעיפים שקיבלו תשובה, לפי הסימונים והזיהוי, מהרגע ש־Unihub התחיל לעקוב.</p>
    </div>
  );
}
