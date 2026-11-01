"use client";

import { useState } from "react";
import { semLabel } from "@/lib/degree";
import { HIGH_HONORS, HONORS, type GradeSummary } from "@/lib/grades";

/** The degree average: what it is, what the remaining courses need for a target, and a projection. */
export function DegreeGrades({
  g,
  editable,
  onExpected,
  onTarget,
}: {
  g: GradeSummary;
  editable: boolean;
  onExpected: (code: string, value: number | null) => void;
  onTarget: (value: number) => void;
}) {
  const [showRows, setShowRows] = useState(false);
  const verdict =
    g.needed === null
      ? null
      : g.needed > 100
        ? `גם עם 100 בכל הקורסים שנותרו לא מגיעים ל־${g.target}.`
        : g.needed <= 60
          ? `כל ציון עובר בקורסים שנותרו מספיק ל־${g.target}.`
          : `כדי לסיים עם ${g.target} צריך ממוצע ${g.needed} בקורסים שנותרו.`;
  return (
    <section id="grades" className="panel scroll-mt-24 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="section-title">ממוצע</h2>
        <p className="font-display text-3xl tabular-nums">{g.average ?? "—"}</p>
        <p className="text-sm text-ink-soft">{g.graded.length ? `${g.graded.length} קורסים עם ציון · משקל ${g.weightDone}` : "עוד אין ציונים: סנכרון משאילתא מביא אותם"}</p>
      </div>

      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <label className="flex items-center gap-2">
          <span className="flex-1">יעד לממוצע התואר</span>
          <input
            type="number"
            min={60}
            max={100}
            disabled={!editable}
            className="btn w-20 rounded-lg px-2 tabular-nums"
            defaultValue={g.target}
            onBlur={(e) => {
              const v = Math.round(Number(e.target.value));
              if (v >= 60 && v <= 100 && v !== g.target) onTarget(v);
            }}
          />
        </label>
        <p className={g.needed !== null && g.needed > 100 ? "text-bad" : ""}>{verdict}</p>
        {g.projected !== null && (
          <p className="sm:col-span-2">
            ממוצע צפוי לפי הציונים שהזנת: <span className="font-medium tabular-nums">{g.projected}</span>
            {!g.projectedComplete && <span className="text-ink-soft"> (רק קורסים שהזנת להם ציון צפוי)</span>}
          </p>
        )}
      </div>

      {g.remaining.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-ink-soft">ציון צפוי לקורסים שנותרו (לא חובה):</p>
          <ul className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {g.remaining.map((r) => (
              <li key={r.code} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="text-xs text-ink-soft">{r.sem ? semLabel(r.sem) : "לא משובץ"} · משקל {r.weight}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
                  disabled={!editable}
                  aria-label={`ציון צפוי ב${r.name}`}
                  className="btn w-16 rounded-lg px-2 tabular-nums"
                  defaultValue={r.expected ?? ""}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    const v = raw === "" ? null : Math.max(0, Math.min(100, Math.round(Number(raw))));
                    if (v !== r.expected && (v === null || Number.isFinite(v))) onExpected(r.code, v);
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {g.graded.length > 0 && (
        <div className="mt-4">
          <button type="button" className="text-sm text-ink-soft underline decoration-rule underline-offset-4" onClick={() => setShowRows(!showRows)} aria-expanded={showRows}>
            {showRows ? "הסתרת הציונים" : "הציונים שנספרים"}
          </button>
          {showRows && (
            <ul className="mt-2 space-y-1 text-sm">
              {g.graded.map((r) => (
                <li key={r.code} className="flex gap-2">
                  <span className="flex-1">{r.name}</span>
                  <span className="text-xs text-ink-soft">{r.sem ? semLabel(r.sem) : ""} · משקל {r.weight}</span>
                  <span className="w-8 text-end tabular-nums">{r.grade}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-ink-soft">
        ממוצע משוקלל לפי כללי האו״פ במדעים: קורס רגיל לפי הנ״ז שלו, קורס מתקדם וסמינר פי 1.5. קורסים מהכרה בלימודים קודמים לא נכנסים לממוצע. הצטיינות: ממוצע {HONORS}+ ובין 20% הבוגרים הטובים במחלקה; הצטיינות
        יתרה: {HIGH_HONORS}+ ובין 20% הטובים מהמצטיינים{g.ouShare < 2 / 3 ? ". שימו לב: נדרשות לפחות שני שלישים מהנ״ז באו״פ" : ""}. אפשר לשפר ציון בתואר בבחינה חוזרת בעד שלושה קורסים.
      </p>
    </section>
  );
}
