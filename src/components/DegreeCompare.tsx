import { itemIssues, lastSemester, planDiff, requirements, semestersOf, semLabel, semIndex, type DegreePlan } from "@/lib/degree";
import { examLoad } from "@/lib/examLoad";
import { gradeSummary } from "@/lib/grades";

/** Main plan vs. a what-if version, side by side. */
export function DegreeCompare({ main, other, otherName, current }: { main: DegreePlan; other: DegreePlan; otherName: string; current: string }) {
  const sum = (p: DegreePlan) => {
    const sems = semestersOf(p, current).filter((s) => semIndex(s.sem) > semIndex(current));
    const heaviest = sems.reduce((m, s) => (s.credits > m.credits ? s : m), { sem: "", credits: 0 } as { sem: string; credits: number });
    const exams = Math.max(0, ...sems.map((s) => examLoad(p, s.sem)?.courses.length ?? 0));
    return {
      last: lastSemester(p),
      failing: requirements(p, current).filter((r) => !r.ok).length,
      errors: p.items.flatMap((i) => itemIssues(p, i, current)).filter((x) => x.severity === "error").length,
      warns: p.items.flatMap((i) => itemIssues(p, i, current)).filter((x) => x.severity === "warn").length,
      heaviest,
      exams,
      projected: gradeSummary(p, current).projected,
      bySem: Object.fromEntries(sems.map((s) => [s.sem, s.credits])),
    };
  };
  const a = sum(main);
  const b = sum(other);
  const allSems = [...new Set([...Object.keys(a.bySem), ...Object.keys(b.bySem)])].sort((x, y) => semIndex(x) - semIndex(y));
  const diff = planDiff(main, other);
  const better = (x: number, y: number) => (y < x ? "text-ok" : y > x ? "text-bad" : "");
  const row = (label: string, x: React.ReactNode, y: React.ReactNode, cls = "") => (
    <tr className="border-t border-rule">
      <th scope="row" className="py-1.5 pe-3 text-start font-normal text-ink-soft">
        {label}
      </th>
      <td className="py-1.5 pe-3 tabular-nums">{x}</td>
      <td className={`py-1.5 tabular-nums ${cls}`}>{y}</td>
    </tr>
  );
  return (
    <section className="panel overflow-x-auto p-4">
      <h2 className="section-title">השוואה</h2>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr>
            <th />
            <th className="pe-3 text-start font-medium">התכנית הראשית</th>
            <th className="text-start font-medium">{otherName}</th>
          </tr>
        </thead>
        <tbody>
          {row("סיום", a.last ? semLabel(a.last) : "—", b.last ? semLabel(b.last) : "—", a.last && b.last ? better(semIndex(a.last), semIndex(b.last)) : "")}
          {row("דרישות שלא מתקיימות", a.failing, b.failing, better(a.failing, b.failing))}
          {row("בעיות שיבוץ", a.errors, b.errors, better(a.errors, b.errors))}
          {row("אזהרות", a.warns, b.warns, better(a.warns, b.warns))}
          {row("הסמסטר הכבד ביותר", a.heaviest.sem ? `${a.heaviest.credits} נ״ז (${semLabel(a.heaviest.sem)})` : "—", b.heaviest.sem ? `${b.heaviest.credits} נ״ז (${semLabel(b.heaviest.sem)})` : "—", better(a.heaviest.credits, b.heaviest.credits))}
          {row("הכי הרבה בחינות בסמסטר", a.exams, b.exams, better(a.exams, b.exams))}
          {(a.projected !== null || b.projected !== null) && row("ממוצע צפוי", a.projected ?? "—", b.projected ?? "—")}
          {allSems.map((s) => row(`נ״ז ב${semLabel(s)}`, a.bySem[s] ?? "—", b.bySem[s] ?? "—"))}
        </tbody>
      </table>
      {diff.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-medium">מה שונה</h3>
          <ul className="mt-1 space-y-0.5 text-sm">
            {diff.map((d) => (
              <li key={d.code}>
                {d.name}:{" "}
                <span className="text-ink-soft">
                  {d.kind === "moved" ? `${d.from ? semLabel(d.from) : "לא משובץ"} ← ${d.to ? semLabel(d.to) : "לא משובץ"}` : d.kind === "added" ? `נוסף (${d.to ? semLabel(d.to) : "לא משובץ"})` : "הוסר"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
