/** The small drawn parts of the goals pages: ring and trend line. No state, usable anywhere. (The big chart is GoalChart.) */

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
