/**
 * The semester strategist on screen: the full section for the course page and a one-line badge
 * for the courses index (StrategyBadge, loads its own data).
 */
import { cache } from "react";
import { Icon } from "@/components/Icon";
import { prepMinutes } from "@/lib/planner";
import { courseStrategy, type CourseStrategy, type Crunch } from "@/lib/strategy";
import { coursesFor, getProgress } from "@/lib/progress";
import { getCourses, getSpentByAssignment } from "@/lib/userdata";
import { todayInIsrael } from "@/lib/semester";

const STATE: Record<string, string> = { submitted: "הוגש", skipped: "ויתרת", missed: "עבר המועד", open: "פתוח" };

export function StrategyPanel({ s, crunches, color }: { s: CourseStrategy; crunches: Crunch[]; color: string }) {
  const best = new Set(s.best ?? []);
  return (
    <section className="panel p-5">
      <h2 className="section-title">אסטרטגיית מטלות</h2>
      <ul className="mt-3 space-y-2 text-[15px] leading-relaxed">
        {s.lines.map((l, i) => (
          <li key={i} className={l.tone === "info" && i > 0 ? "text-ink-soft" : ""}>
            {l.tone === "warn" ? <span className="hl">{l.text}</span> : l.text}
          </li>
        ))}
      </ul>
      <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="המטלות לפי מצב">
        {s.items.map((i) => {
          const must = s.mandatory.includes(i.n);
          const inBest = best.has(i.n) && i.state === "open";
          return (
            <li
              key={i.n}
              title={`${i.label}: ${STATE[i.state]}${must ? ", חובה" : inBest ? ", במסלול הקצר" : ""}`}
              className={`rounded-lg border px-2 py-1 text-xs tabular-nums ${i.state === "submitted" ? "border-transparent text-bg" : i.state === "open" ? "border-rule" : "border-dashed border-rule text-ink-soft line-through"} ${must ? "ring-2 ring-ink" : ""}`}
              style={i.state === "submitted" ? { background: color } : inBest ? { background: `color-mix(in srgb, ${color} 18%, transparent)` } : undefined}
            >
              {i.label} · {i.weight}
              {must && <span className="ms-1 font-semibold">חובה</span>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-ink-soft">צבוע: הוגש · רקע בהיר: הדרך הקצרה ביותר · מסגרת עבה: חובה</p>
      {crunches.length > 0 && (
        <div className="mt-5 border-t border-rule pt-4">
          <h3 className="text-sm font-semibold">שבועות עמוסים</h3>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed">
            {crunches.map((c) => (
              <li key={c.first} className="flex gap-2">
                <Icon name={c.tone === "warn" ? "alert" : "calendar"} className={`mt-0.5 size-4 shrink-0 ${c.tone === "warn" ? "text-ink" : "text-ink-soft"}`} />
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const load = cache(async () => {
  const [progress, base, spent] = await Promise.all([getProgress(), getCourses(), getSpentByAssignment()]);
  return { courses: coursesFor(progress, base), progress, spent };
});

/** One line for the courses index: what's mandatory, or how much can still be skipped. */
export async function StrategyBadge({ courseCode }: { courseCode: string }) {
  const { courses, progress, spent } = await load();
  const course = courses.find((c) => c.code === courseCode);
  if (!course) return null;
  const mine = Object.fromEntries(Object.entries(spent).filter(([k]) => k.startsWith(courseCode + "|")).map(([k, v]) => [k.split("|")[1], v]));
  const s = courseStrategy({ course, progress, today: todayInIsrael(), prep: prepMinutes, spent: mine });
  const label = (n: string) => s.items.find((i) => i.n === n)?.label ?? n;
  const open = s.items.filter((i) => i.state === "open");
  const slack = s.earned + open.reduce((t, i) => t + i.weight, 0) - s.min;
  const text = s.satisfied
    ? "עמדת בדרישת המטלות"
    : !s.feasible
      ? "כבר אי אפשר לעמוד בדרישה. כדאי לפנות למרכז ההוראה"
      : s.mandatory.length
        ? `חובה: ${s.mandatory.map(label).join(", ")}`
        : `חסרות ${s.min - s.earned} נק׳ · מרווח לוויתור: ${slack} נק׳`;
  return <p className={`text-sm ${!s.feasible || s.mandatory.length ? "" : "text-ink-soft"}`}>{!s.feasible ? <span className="hl">{text}</span> : text}</p>;
}
