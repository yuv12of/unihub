/** The drawn parts of the goals pages: ring, trend line and the progress chart. No state, usable anywhere. */

export function ProgressRing({ p, color, size = 52, label = true }: { p: number; color: string; size?: number; label?: boolean }) {
  const r = 19;
  const c = 2 * Math.PI * r;
  const pct = Math.round(p * 100);
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className="shrink-0" role="img" aria-label={`${pct} אחוז`}>
      <circle cx="24" cy="24" r={r} fill="none" stroke="var(--rule)" strokeWidth="6" />
      {p > 0 && <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${Math.max(0.5, p * c)} ${c}`} transform="rotate(-90 24 24)" />}
      {label && (
        <text x="24" y="28.5" textAnchor="middle" fontSize="12.5" fontWeight="700" fill="var(--ink)">
          {pct}
        </text>
      )}
    </svg>
  );
}

/** Eight weekly points as a small line; flat lines sit in the middle so they don't hug an edge. */
export function Spark({ points, color }: { points: number[]; color: string }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const y = (v: number) => (max === min ? 14 : 24 - ((v - min) / (max - min)) * 20);
  const pts = points.map((v, i) => `${2 + (i * 60) / (points.length - 1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 64 28" width="64" height="28" className="shrink-0" aria-hidden style={{ direction: "ltr" }}>
      <polyline points={pts} fill="none" stroke={max === min ? "var(--rule-strong)" : color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const dm = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`;

/**
 * Progress over time: the real line, the straight planned line to the deadline (if there is one)
 * and a dotted projection at the recent pace. Time runs left to right, as in every chart.
 */
export function GoalChart({
  points,
  start,
  today,
  due,
  projected,
  color,
}: {
  points: { date: string; p: number }[];
  start: string;
  today: string;
  due: string | null;
  projected: string | null;
  color: string;
}) {
  const W = 340;
  const H = 190;
  const L = 26;
  const R = 8;
  const T = 12;
  const B = 28;
  const t = (iso: string) => Date.parse(iso + "T00:00:00Z") / 86_400_000;
  const t0 = t(start);
  // the axis ends at the latest of: today, the deadline, the projection (capped so one slow goal doesn't flatten the chart)
  const cap = t(today) + Math.max(30, (t(today) - t0) * 2);
  const t1 = Math.max(t(today) + 1, due ? t(due) : 0, projected ? Math.min(t(projected), cap) : 0);
  const x = (iso: string) => L + ((Math.min(t(iso), t1) - t0) / (t1 - t0)) * (W - L - R);
  const y = (p: number) => T + (1 - p) * (H - T - B);
  const now = points.at(-1)!;
  const line = points.map((q) => `${x(q.date).toFixed(1)},${y(q.p).toFixed(1)}`).join(" ");
  const projEnd = projected && t(projected) <= cap ? { x: x(projected), y: y(1) } : projected ? { x: W - R, y: y(now.p + ((1 - now.p) * (cap - t(today))) / (t(projected) - t(today))) } : null;
  const todayX = x(today);
  const farFromEdges = todayX - L > 34 && W - R - todayX > 34;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`גרף התקדמות: ${Math.round(now.p * 100)} אחוז היום`} style={{ direction: "ltr" }}>
      {[0, 0.5, 1].map((p) => (
        <g key={p}>
          <line x1={L} x2={W - R} y1={y(p)} y2={y(p)} stroke="var(--rule)" strokeWidth="1" />
          <text x={L - 6} y={y(p) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink-soft)">
            {p * 100}
          </text>
        </g>
      ))}
      {due && <line x1={x(start)} y1={y(0)} x2={x(due)} y2={y(1)} stroke="var(--rule-strong)" strokeWidth="1.5" strokeDasharray="5 5" />}
      {projEnd && <line x1={todayX} y1={y(now.p)} x2={projEnd.x} y2={projEnd.y} stroke={color} strokeWidth="2" strokeDasharray="1 5" strokeLinecap="round" />}
      <polyline points={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={todayX} cy={y(now.p)} r="5" fill={color} stroke="var(--surface)" strokeWidth="2" />
      <text x={L} y={H - 8} fontSize="10" fill="var(--ink-soft)">
        {dm(start)}
      </text>
      {farFromEdges && (
        <text x={todayX} y={H - 8} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink)">
          היום
        </text>
      )}
      <text x={W - R} y={H - 8} textAnchor="end" fontSize="10" fill="var(--ink-soft)">
        {due && t(due) >= t1 - 0.5 ? dm(due) : projected && t(projected) <= cap ? dm(projected) : farFromEdges ? "" : "היום"}
      </text>
    </svg>
  );
}

export function ChartLegend({ color, planned, projected }: { color: string; planned: boolean; projected: boolean }) {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
      <span className="flex items-center gap-1.5">
        <span className="h-[3px] w-4 rounded-full" style={{ background: color }} />
        בפועל
      </span>
      {planned && (
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-rule-strong" />
          מתוכנן
        </span>
      )}
      {projected && (
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dotted" style={{ borderColor: color }} />
          תחזית
        </span>
      )}
    </p>
  );
}
