"use client";

import { useMemo, useState } from "react";

interface Row {
  n: string;
  label: string;
  weight: number;
  grade: number | null; // real grade, when known
  status: "todo" | "in_progress" | "submitted" | "skipped";
}

/**
 * What-if calculator. Uses the usual Open University rule: the assignments you submit carry their
 * weights (up to the course maximum) and the exam carries the rest; the final grade counts only
 * when the exam grade is at least 60.
 */
export function GradeCalculator({ rows, max, color }: { rows: Row[]; max: number; color: string }) {
  const graded = rows.filter((r) => r.grade != null);
  const avg = graded.length ? Math.round(graded.reduce((s, r) => s + r.grade! * r.weight, 0) / graded.reduce((s, r) => s + r.weight, 0)) : 85;

  const [plan, setPlan] = useState<Record<string, { on: boolean; grade: number }>>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.n,
        { on: r.status === "submitted" || (r.status !== "skipped" && r.weight > 0), grade: r.grade ?? avg },
      ]),
    ),
  );
  const [exam, setExam] = useState(80);
  const [target, setTarget] = useState(85);

  const { weight, points } = useMemo(() => {
    // Highest-graded assignments first, until the course maximum is reached.
    let w = 0;
    let p = 0;
    for (const r of [...rows].filter((r) => plan[r.n]?.on && r.weight > 0).sort((a, b) => plan[b.n].grade - plan[a.n].grade)) {
      const take = Math.min(r.weight, max - w);
      if (take <= 0) break;
      w += take;
      p += take * plan[r.n].grade;
    }
    return { weight: w, points: p };
  }, [rows, plan, max]);

  const final = Math.round((exam * (100 - weight) + points) / 100);
  const needed = Math.ceil((target * 100 - points) / (100 - weight));
  const neededText =
    needed <= 60 ? "60 (המינימום למעבר)" : needed > 100 ? "יותר מ־100, כלומר לא אפשרי עם המטלות האלה" : String(needed);

  return (
    <details className="group border-t border-rule px-5 py-4">
      <summary className="cursor-pointer text-sm font-semibold">מחשבון ציון</summary>
      <div className="mt-3 space-y-3 text-sm">
        <ul className="space-y-1.5">
          {rows
            .filter((r) => r.weight > 0)
            .map((r) => (
              <li key={r.n} className="flex items-center gap-3">
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={plan[r.n].on}
                    onChange={(e) => setPlan((p) => ({ ...p, [r.n]: { ...p[r.n], on: e.target.checked } }))}
                    style={{ accentColor: color }}
                  />
                  <span className="truncate">
                    {r.label} <span className="text-ink-soft">({r.weight})</span>
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
                  value={plan[r.n].grade}
                  disabled={!plan[r.n].on}
                  onChange={(e) =>
                    setPlan((p) => ({ ...p, [r.n]: { ...p[r.n], grade: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } }))
                  }
                  className="w-16 rounded-md border border-rule bg-surface px-2 py-1 text-center tabular-nums disabled:opacity-40"
                  aria-label={`ציון ב${r.label}`}
                />
                <span className="w-10 text-xs text-ink-soft">{r.grade != null ? "בפועל" : "צפוי"}</span>
              </li>
            ))}
        </ul>

        <label className="flex items-center gap-3">
          <span className="flex-1">ציון בבחינה</span>
          <input type="range" min={0} max={100} value={exam} onChange={(e) => setExam(Number(e.target.value))} className="w-32" style={{ accentColor: color }} />
          <span className="w-8 text-end tabular-nums">{exam}</span>
        </label>

        <div className="rounded-lg bg-bg/60 px-3 py-2.5 leading-relaxed">
          {exam < 60 ? (
            <p>
              <span className="hl">מתחת ל־60 בבחינה הקורס לא עובר</span>, בלי קשר למטלות.
            </p>
          ) : (
            <p>
              ציון סופי משוער: <strong className="text-lg tabular-nums">{final}</strong>
              <span className="text-ink-soft"> (מטלות {weight}%, בחינה {100 - weight}%)</span>
            </p>
          )}
          <p className="mt-1">
            כדי להגיע ל־
            <input
              type="number"
              min={60}
              max={100}
              value={target}
              onChange={(e) => setTarget(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="mx-1 w-14 rounded-md border border-rule bg-surface px-1.5 py-0.5 text-center tabular-nums"
              aria-label="ציון יעד"
            />
            צריך בבחינה: <strong className="tabular-nums">{neededText}</strong>
          </p>
        </div>
        <p className="text-xs text-ink-soft">
          לפי הכלל הרגיל באו״פ: המטלות שהוגשו נספרות לפי המשקל שלהן עד {max} נקודות. כללים מיוחדים של הקורס מופיעים למטה.
        </p>
      </div>
    </details>
  );
}
