"use client";

/**
 * At-a-glance pieces of an assignment row: the parts bar, the mini timeline, and the pace word.
 * The full versions live in the open card (PartsGrid, PaceChart).
 */
import { addDays, daysBetween } from "@/lib/semester";
import { expectedShare, paceStatus, type Now, type PacePoint } from "@/lib/pace";

const short = (d: string) => `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}`;

/** One segment per part, grouped by question: filled = has an answer. */
export function PartsBar({ groups, answered, color }: { groups: { q: number; keys: string[] }[]; answered: (k: string) => boolean; color: string }) {
  const total = groups.reduce((s, g) => s + g.keys.length, 0);
  const done = groups.reduce((s, g) => s + g.keys.filter(answered).length, 0);
  return (
    <span className="flex w-full max-w-48 items-center gap-1" role="img" aria-label={`${done} מתוך ${total} סעיפים עם תשובה`}>
      {groups.map((g) => (
        <span key={g.q} className="flex flex-1 gap-px" style={{ flexGrow: g.keys.length }}>
          {g.keys.map((k) => (
            <span key={k} className="h-1.5 flex-1 rounded-full" style={{ background: answered(k) ? color : "var(--rule-strong)" }} />
          ))}
        </span>
      ))}
    </span>
  );
}

/** The pace as one word, coloured only when behind. */
export function paceWord(answered: number, total: number, win: { start: string; target: string } | null | undefined, now: Now): { text: string; behind: boolean } | null {
  if (!win || total <= 0) return null;
  if (answered >= total) return { text: "מוכן", behind: false };
  if (now.date < win.start && answered === 0) return { text: `מתחילים ב־${short(win.start)}`, behind: false };
  const { status, gap } = paceStatus(answered, total, expectedShare(win, now));
  if (status === "behind") return { text: `מאחור ב־${gap}`, behind: true };
  if (status === "ahead") return { text: "לפני הקצב", behind: false };
  return { text: "בקצב", behind: false };
}

/** A tiny timeline: my answered parts (course colour) against the steady line (dashed). */
export function PaceSpark({ points, answered, total, window: win, due, color, now }: { points: PacePoint[]; answered: number; total: number; window: { start: string; target: string }; due: string; color: string; now: Now }) {
  const W = 64;
  const H = 18;
  const days = Math.max(1, daysBetween(win.start, due) + 1);
  const xDay = (d: string, minutes = 0) => (Math.min(Math.max(daysBetween(win.start, d) + minutes / 1440, 0), days) / days) * W;
  const y = (v: number) => 1 + (1 - v / Math.max(total, 1)) * (H - 2);
  const target = xDay(addDays(win.target, 1));
  const israelDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(iso));
  const pts = points.filter((p) => p.total === total);
  const xNow = xDay(now.date, now.minutes);
  let path = "";
  if (pts.length) {
    path = `M${xDay(israelDay(pts[0].at)).toFixed(1)},${y(pts[0].answered).toFixed(1)}`;
    for (const p of pts.slice(1)) path += ` H${xDay(israelDay(p.at)).toFixed(1)} V${y(p.answered).toFixed(1)}`;
    path += ` H${xNow.toFixed(1)}`;
    if (answered !== pts.at(-1)!.answered) path += ` V${y(answered).toFixed(1)}`;
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="shrink-0 text-ink-soft" style={{ direction: "ltr" }} aria-hidden>
      <path d={`M0,${y(0)} L${target},${y(total)} L${W},${y(total)}`} fill="none" stroke="currentColor" strokeDasharray="2 2" strokeWidth={1} />
      {path && <path d={path} fill="none" stroke={color} strokeWidth={1.75} />}
      <circle cx={Math.min(xNow, W - 1.5)} cy={y(answered)} r={1.75} fill={color} />
    </svg>
  );
}
