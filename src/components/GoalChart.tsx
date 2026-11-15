"use client";

import { useId, useRef, useState } from "react";
import { curveAt, curveSlopes, type ChartPoint } from "@/lib/goalMeta";
import { fromIsraelLocal, israelLocal } from "@/lib/time";

const TZ = "Asia/Jerusalem";
const dayFmt = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Range = "all" | "week" | "day";
const RANGES: { key: Range; label: string; span: number }[] = [
  { key: "all", label: "הכול", span: Infinity },
  { key: "week", label: "שבוע", span: 7 * DAY },
  { key: "day", label: "יום", span: DAY },
];

/**
 * Progress over time. The filled line is what happened, drawn as one smooth curve through the
 * completions, each at its own minute; a dot marks every completion. The dashed line is the
 * straight plan to the deadline; the dotted line continues the recent pace. Time runs left to right.
 * On a goal that has run for weeks an hour is thinner than the line, so the chart can zoom to the
 * last week or the last day. Moving a finger or the mouse across it reads out any moment; the
 * keyboard arrows do the same.
 */
export function GoalChart({ points, now, due, projected, color, marks = [] }: { points: ChartPoint[]; now: number; due: string | null; projected: string | null; color: string; marks?: { date: string; label: string; done: boolean }[] }) {
  const W = 340;
  const H = 200;
  const L = 28;
  const R = 12;
  const T = 14;
  const B = 30;
  const svg = useRef<SVGSVGElement>(null);
  const clip = useId();
  const [at, setAt] = useState<number | null>(null);
  const [range, setRange] = useState<Range>("all");

  const t0 = points[0].t;
  const dueT = due ? Date.parse(due + "T21:59:59Z") : null; // the end of that day in Israel
  const projT = projected ? Date.parse(projected + "T10:00:00Z") : null;
  // the whole story ends at the latest of now, the deadline and the projection; one slow goal mustn't flatten the chart
  const cap = now + Math.max(30 * DAY, (now - t0) * 2);
  const t1 = Math.max(now + (now - t0) * 0.08 + HOUR, dueT ?? 0, projT ? Math.min(projT, cap) : 0);
  // a zoom is offered only when it would show less than the whole chart
  const ranges = RANGES.filter((r) => r.key === "all" || now - t0 > r.span * 1.15 || t1 - now > r.span);
  const span = RANGES.find((r) => r.key === range)!.span;
  const zoomed = range !== "all" && ranges.some((r) => r.key === range);
  // the window being shown: everything, or the last week / day with a little room after now
  const v0 = zoomed ? Math.max(t0, now - span) : t0;
  const v1 = zoomed ? now + Math.max((now - v0) * 0.15, HOUR / 4) : t1;
  const fine = v1 - v0 < 10 * DAY; // close enough for the hour to matter

  const x = (t: number) => L + ((t - v0) / (v1 - v0)) * (W - L - R);
  const y = (p: number) => T + (1 - p) * (H - T - B);
  const pNow = points.at(-1)!.p;
  // one cubic segment per pair of points, with the slopes that keep the curve between them
  const slopes = curveSlopes(points);
  const f = (n: number) => n.toFixed(2);
  const line = points
    .map((q, i) => {
      if (i === 0) return `M${f(x(q.t))},${f(y(q.p))}`;
      const a = points[i - 1];
      const h = (q.t - a.t) / 3;
      return `C${f(x(a.t + h))},${f(y(a.p + slopes[i - 1] * h))} ${f(x(q.t - h))},${f(y(q.p - slopes[i] * h))} ${f(x(q.t))},${f(y(q.p))}`;
    })
    .join(" ");
  const area = `${line} L${f(x(now))},${y(0)} L${f(x(t0))},${y(0)} Z`;
  const projEnd = projT == null || pNow >= 1 ? null : { x: x(projT), y: y(1) };
  const inView = (t: number) => t >= v0 && t <= v1;
  // every completion gets a dot, so two on the same day are seen apart
  const ticks = points.filter((q) => q.label && inView(q.t));
  // milestone target dates as small diamonds on the time axis
  const dots = marks.map((m) => ({ ...m, t: Date.parse(m.date + "T10:00:00Z") })).filter((m) => inView(m.t));
  const planned = (t: number) => (dueT == null ? null : dueT <= t0 ? 1 : Math.max(0, Math.min(1, (t - t0) / (dueT - t0))));
  // when the hour matters, a faint line at every midnight
  const midnights: number[] = [];
  if (fine) for (let m = fromIsraelLocal(israelLocal(v0).slice(0, 10) + "T00:00"); m != null && m <= v1 && midnights.length < 12; m = fromIsraelLocal(israelLocal(m + 26 * HOUR).slice(0, 10) + "T00:00")) if (m > v0) midnights.push(m);

  // --- reading a moment
  const t = at ?? now;
  const future = t > now;
  const pAt = future ? null : curveAt(points, t, slopes);
  const plan = planned(t);
  const last = future ? undefined : [...points].reverse().find((q) => q.label && q.t <= t);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const stamp = (ms: number) => `${dayFmt.format(ms)}${fine ? ` ${timeFmt.format(ms)}` : ""}`;
  const near = at == null ? undefined : dots.filter((m) => Math.abs(m.t - t) < (v1 - v0) * 0.03).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
  const when = at == null ? (fine ? "עכשיו" : "היום") : stamp(t);

  const move = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const vx = ((clientX - box.left) / box.width) * W;
    const tt = v0 + ((Math.min(Math.max(vx, L), W - R) - L) / (W - L - R)) * (v1 - v0);
    setAt(Math.abs(tt - now) < (v1 - v0) * 0.02 ? null : tt);
  };
  const nudge = (dir: number) => setAt((cur) => Math.min(v1, Math.max(v0, (cur ?? now) + (dir * (v1 - v0)) / 40)));

  const nowX = x(now);
  const anchor = nowX < L + 22 ? "start" : nowX > W - R - 22 ? "end" : "middle";
  const endLabel = zoomed ? stamp(v1) : dueT != null && dueT >= t1 - DAY / 2 ? dayFmt.format(dueT) : projT != null && projT <= cap && projT >= t1 - DAY / 2 ? dayFmt.format(projT) : dayFmt.format(t1);
  const showStart = nowX - L > (fine ? 76 : 44);
  const showEnd = W - R - nowX > (fine ? 76 : 44);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p className="flex min-h-10 min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm" aria-live="polite">
          <b>{when}</b>
          {pAt != null && (
            <span className="flex items-center gap-1.5">
              <span className="h-[3px] w-4 rounded-full" style={{ background: color }} />
              בפועל {pct(pAt)}
            </span>
          )}
          {plan != null && (
            <span className="flex items-center gap-1.5 text-ink-soft">
              <span className="w-4 border-t-2 border-dashed border-rule-strong" />
              מתוכנן {pct(plan)}
            </span>
          )}
          {future && projEnd && projT != null && (
            <span className="flex items-center gap-1.5 text-ink-soft">
              <span className="w-4 border-t-2 border-dotted" style={{ borderColor: color }} />
              תחזית {pct(Math.min(1, pNow + ((1 - pNow) * (t - now)) / (projT - now)))}
            </span>
          )}
          {near ? (
            <span className="min-w-0 truncate">
              אבן דרך{near.done ? " (הושלמה)" : ""}: {near.label}
            </span>
          ) : (
            last && (
              <span className="min-w-0 truncate text-ink-soft">
                אחרון: {last.label} ({stamp(last.t)})
              </span>
            )
          )}
        </p>
        {ranges.length > 1 && (
          <div role="group" aria-label="טווח הזמן בגרף" className="flex shrink-0 gap-1">
            {ranges.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={(zoomed ? range : "all") === r.key}
                onClick={() => {
                  setRange(r.key);
                  setAt(null);
                }}
                className={`min-h-9 rounded-lg border px-2.5 text-xs ${(zoomed ? range : "all") === r.key ? "accent-surface border-transparent font-medium" : "border-rule-strong"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair touch-pan-y select-none outline-offset-4"
        style={{ direction: "ltr" }}
        role="img"
        tabIndex={0}
        aria-label={`גרף התקדמות. ${pct(pNow)} עכשיו${planned(now) != null ? `, מתוכנן ${pct(planned(now)!)}` : ""}. ${ticks.length} השלמות מסומנות${dots.length ? `, ${dots.length} תאריכי יעד של אבני דרך על ציר הזמן` : ""}. חיצים ימינה ושמאלה לקריאת נקודות בזמן.`}
        onPointerMove={(e) => move(e.clientX)}
        onPointerDown={(e) => move(e.clientX)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setAt(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") nudge(1);
          else if (e.key === "ArrowLeft") nudge(-1);
          else if (e.key === "Escape") setAt(null);
          else return;
          e.preventDefault();
        }}
        onBlur={() => setAt(null)}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={L} y={0} width={W - L - R} height={y(0) + 0.5} />
          </clipPath>
        </defs>
        {[0, 0.5, 1].map((p) => (
          <g key={p}>
            <line x1={L} x2={W - R} y1={y(p)} y2={y(p)} stroke="var(--rule)" strokeWidth="1" />
            <text x={L - 6} y={y(p) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink-soft)">
              {p * 100}
            </text>
          </g>
        ))}
        {midnights.map((m) => (
          <line key={m} x1={x(m)} x2={x(m)} y1={T} y2={y(0)} stroke="var(--rule)" strokeWidth="1" strokeDasharray="2 3" />
        ))}
        <g clipPath={`url(#${clip})`}>
          {dueT != null && dueT > t0 && <line x1={x(t0)} y1={y(0)} x2={x(dueT)} y2={y(1)} stroke="var(--rule-strong)" strokeWidth="1.5" strokeDasharray="5 5" />}
          <path d={area} fill={color} opacity="0.13" />
          {projEnd && <line x1={nowX} y1={y(pNow)} x2={projEnd.x} y2={projEnd.y} stroke={color} strokeWidth="2" strokeDasharray="1 5" strokeLinecap="round" />}
          <path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <line x1={nowX} x2={nowX} y1={y(pNow)} y2={y(0)} stroke={color} strokeWidth="1" opacity="0.45" />
        </g>
        {ticks.length <= 40 && ticks.map((q) => <circle key={q.t + (q.label ?? "")} cx={x(q.t)} cy={y(q.p)} r="2.6" fill="var(--surface)" stroke={color} strokeWidth="1.8" />)}
        <circle cx={nowX} cy={y(pNow)} r="9" fill={color} opacity="0.18" />
        <circle cx={nowX} cy={y(pNow)} r="5" fill={color} stroke="var(--surface)" strokeWidth="2" />
        {dots.map((m) => {
          const cx = x(m.t);
          const cy = y(0);
          const late = !m.done && m.t < now;
          return <path key={m.date + m.label} d={`M${cx},${cy - 5} L${cx + 4.5},${cy} L${cx},${cy + 5} L${cx - 4.5},${cy} Z`} fill={m.done ? "var(--ink-soft)" : late ? "var(--highlight)" : "var(--surface)"} stroke={late ? "var(--highlight-ink)" : "var(--ink)"} strokeWidth="1.5" />;
        })}
        {at != null && (
          <g>
            <line x1={x(at)} x2={x(at)} y1={T} y2={y(0)} stroke="var(--ink)" strokeWidth="1" />
            {pAt != null && <circle cx={x(at)} cy={y(pAt)} r="4" fill="var(--surface)" stroke={color} strokeWidth="2.5" />}
            {plan != null && <circle cx={x(at)} cy={y(plan)} r="3" fill="var(--surface)" stroke="var(--rule-strong)" strokeWidth="2" />}
          </g>
        )}
        {showStart && (
          <text x={L} y={H - 9} fontSize="10" fill="var(--ink-soft)">
            {stamp(v0)}
          </text>
        )}
        <text x={nowX} y={H - 9} textAnchor={anchor} fontSize="10.5" fontWeight="700" fill="var(--ink)">
          {fine ? "עכשיו" : "היום"}
        </text>
        {showEnd && (
          <text x={W - R} y={H - 9} textAnchor="end" fontSize="10" fill="var(--ink-soft)">
            {endLabel}
          </text>
        )}
      </svg>
    </div>
  );
}
