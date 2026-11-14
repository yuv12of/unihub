"use client";

import { useRef, useState } from "react";
import { valueAt, type ChartPoint } from "@/lib/goalMeta";

const TZ = "Asia/Jerusalem";
const dayFmt = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const DAY = 86_400_000;

/**
 * Progress over time. The filled line is what happened; the dashed line is the straight plan to the
 * deadline; the dotted line continues today's pace. Time runs left to right, as in every chart.
 * Moving a finger or the mouse across it reads out any moment; the keyboard arrows do the same.
 */
export function GoalChart({ points, now, due, projected, color }: { points: ChartPoint[]; now: number; due: string | null; projected: string | null; color: string }) {
  const W = 340;
  const H = 200;
  const L = 28;
  const R = 12;
  const T = 14;
  const B = 30;
  const svg = useRef<SVGSVGElement>(null);
  const [at, setAt] = useState<number | null>(null);

  const t0 = points[0].t;
  const dueT = due ? Date.parse(due + "T21:59:59Z") : null; // the end of that day in Israel
  const projT = projected ? Date.parse(projected + "T10:00:00Z") : null;
  // the axis ends at the latest of now, the deadline and the projection; one slow goal mustn't flatten the chart
  const cap = now + Math.max(30 * DAY, (now - t0) * 2);
  const t1 = Math.max(now + (now - t0) * 0.08 + 3_600_000, dueT ?? 0, projT ? Math.min(projT, cap) : 0);
  const x = (t: number) => L + ((Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0)) * (W - L - R);
  const y = (p: number) => T + (1 - p) * (H - T - B);
  const pNow = points.at(-1)!.p;
  const line = points.map((q) => `${x(q.t).toFixed(1)},${y(q.p).toFixed(1)}`).join(" ");
  const area = `${x(t0).toFixed(1)},${y(0)} ${line} ${x(now).toFixed(1)},${y(0)}`;
  const projEnd = projT == null || pNow >= 1 ? null : projT <= cap ? { x: x(projT), y: y(1) } : { x: x(t1), y: y(pNow + ((1 - pNow) * (t1 - now)) / (projT - now)) };
  const planned = (t: number) => (dueT == null ? null : dueT <= t0 ? 1 : Math.max(0, Math.min(1, (t - t0) / (dueT - t0))));

  // --- reading a moment
  const t = at ?? now;
  const future = t > now;
  const pAt = future ? null : valueAt(points, t);
  const plan = planned(t);
  const short = t1 - t0 < 3 * DAY;
  const last = future ? undefined : [...points].reverse().find((q) => q.label && q.t <= t);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const when = at == null ? "היום" : `${dayFmt.format(t)}${short ? ` ${timeFmt.format(t)}` : ""}`;

  const move = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const vx = ((clientX - box.left) / box.width) * W;
    const tt = t0 + ((Math.min(Math.max(vx, L), W - R) - L) / (W - L - R)) * (t1 - t0);
    setAt(Math.abs(tt - now) < (t1 - t0) * 0.02 ? null : tt);
  };
  const nudge = (dir: number) => setAt((cur) => Math.min(t1, Math.max(t0, (cur ?? now) + (dir * (t1 - t0)) / 40)));

  const nowX = x(now);
  const anchor = nowX < L + 22 ? "start" : nowX > W - R - 22 ? "end" : "middle";
  const endLabel = dueT != null && dueT >= t1 - DAY / 2 ? dayFmt.format(dueT) : projT != null && projT <= cap && projT >= t1 - DAY / 2 ? dayFmt.format(projT) : dayFmt.format(t1);
  const showStart = nowX - L > 44;
  const showEnd = W - R - nowX > 44;

  return (
    <div>
      <p className="flex min-h-10 flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm" aria-live="polite">
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
        {last && <span className="min-w-0 truncate text-ink-soft">אחרון: {last.label}</span>}
      </p>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair touch-pan-y select-none outline-offset-4"
        style={{ direction: "ltr" }}
        role="img"
        tabIndex={0}
        aria-label={`גרף התקדמות. היום ${pct(pNow)}${planned(now) != null ? `, מתוכנן ${pct(planned(now)!)}` : ""}. חיצים ימינה ושמאלה לקריאת נקודות בזמן.`}
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
        {[0, 0.5, 1].map((p) => (
          <g key={p}>
            <line x1={L} x2={W - R} y1={y(p)} y2={y(p)} stroke="var(--rule)" strokeWidth="1" />
            <text x={L - 6} y={y(p) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink-soft)">
              {p * 100}
            </text>
          </g>
        ))}
        {dueT != null && dueT > t0 && <line x1={x(t0)} y1={y(0)} x2={x(dueT)} y2={y(1)} stroke="var(--rule-strong)" strokeWidth="1.5" strokeDasharray="5 5" />}
        <polygon points={area} fill={color} opacity="0.13" />
        {projEnd && <line x1={nowX} y1={y(pNow)} x2={projEnd.x} y2={projEnd.y} stroke={color} strokeWidth="2" strokeDasharray="1 5" strokeLinecap="round" />}
        <polyline points={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <line x1={nowX} x2={nowX} y1={y(pNow)} y2={y(0)} stroke={color} strokeWidth="1" opacity="0.45" />
        <circle cx={nowX} cy={y(pNow)} r="9" fill={color} opacity="0.18" />
        <circle cx={nowX} cy={y(pNow)} r="5" fill={color} stroke="var(--surface)" strokeWidth="2" />
        {at != null && (
          <g>
            <line x1={x(at)} x2={x(at)} y1={T} y2={y(0)} stroke="var(--ink)" strokeWidth="1" />
            {pAt != null && <circle cx={x(at)} cy={y(pAt)} r="4" fill="var(--surface)" stroke={color} strokeWidth="2.5" />}
            {plan != null && <circle cx={x(at)} cy={y(plan)} r="3" fill="var(--surface)" stroke="var(--rule-strong)" strokeWidth="2" />}
          </g>
        )}
        {showStart && (
          <text x={L} y={H - 9} fontSize="10" fill="var(--ink-soft)">
            {dayFmt.format(t0)}
          </text>
        )}
        <text x={nowX} y={H - 9} textAnchor={anchor} fontSize="10.5" fontWeight="700" fill="var(--ink)">
          היום
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
