import type { Course } from "@/lib/semester";
import type { CourseStanding } from "@/lib/progress";

/** Bar of earned assignment weight, scaled to the course maximum, with a tick at the minimum. */
export function WeightBar({ course, st, color }: { course: Course; st: CourseStanding; color: string }) {
  const { min, max } = course.assignmentWeight;
  const pct = (v: number) => `${Math.min(100, (v / Math.max(1, max)) * 100)}%`;
  const passed = st.earned >= min;
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="tabular-nums">
          <span className="text-2xl font-semibold">{st.earned}</span>
          <span className="text-ink-soft">/{min} נק׳ חובה</span>
          {passed && <span className="ms-1.5" aria-label="עברת את המינימום">✓</span>}
        </span>
        <span className="text-xs text-ink-soft tabular-nums">אפשר עד {max}</span>
      </div>
      <div className="relative h-3 rounded-full bg-rule" role="img" aria-label={`נצברו ${st.earned} מתוך מינימום ${min} נקודות משקל`}>
        <div className="absolute inset-y-0 start-0 rounded-full transition-[width] duration-500" style={{ width: pct(st.earned), background: color }} />
        <div className="absolute -inset-y-1 w-1 -translate-x-1/2 rounded-full bg-ink ring-2 ring-surface" style={{ insetInlineStart: pct(min) }} aria-hidden />
      </div>
    </div>
  );
}

export function standingSentence(st: CourseStanding, min: number, max: number) {
  if (st.needed === 0)
    return { text: `עברת את המינימום. כל מטלה נוספת עד ${max} נקודות יכולה רק לעזור.`, warn: false };
  if (st.atRisk)
    return { text: `חסרות ${st.needed} נקודות ונשארו רק ${st.open} פתוחות. כדאי לפנות למרכז ההוראה.`, warn: true };
  if (st.slack > 0)
    return { text: `נשארו ${st.open} נקודות פתוחות. אפשר לוותר על עד ${st.slack} מהן.`, warn: false };
  return { text: `נשארו ${st.open} נקודות פתוחות, וצריך את כולן.`, warn: false };
}

export function StandingText({ st, min, max }: { st: CourseStanding; min: number; max: number }) {
  const s = standingSentence(st, min, max);
  return (
    <p className="mt-3 text-[15px] leading-relaxed">
      <span className={s.warn ? "hl" : undefined}>{s.text}</span>
      {st.average != null && <span className="text-ink-soft"> ממוצע במטלות: {st.average}.</span>}
    </p>
  );
}

export const ruleHe: Record<string, string> = {
  "Must submit at least 3 of 01-05": "חובה להגיש לפחות 3 מהמטלות 01 עד 05.",
  "Zero grades on 01-05 count toward the final grade":
    "ציון אפס במטלות 01 עד 05 נכנס לשקלול ומוריד את הציון הסופי.",
  "06 requires attending the minimum number of tutorials":
    "מטלה 06 ניתנת על השתתפות במספר מינימלי של מפגשי הנחיה.",
  "Assignments may be submitted in pairs": "אפשר להגיש בזוגות.",
};
