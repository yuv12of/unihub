"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { saveDegreePlan } from "@/app/act";
import { Icon } from "@/components/Icon";
import {
  actions,
  autoPlan,
  COURSE,
  COURSES,
  itemIssues,
  lastSemester,
  nextSemester,
  requirements,
  semIndex,
  semLabel,
  semMonths,
  seasonOf,
  semestersOf,
  statusOf,
  totals,
  type DegreeCourse,
  type DegreePlan,
  type Issue,
  type PlanItem,
} from "@/lib/degree";

const LEVEL: Record<DegreeCourse["level"], string> = { regular: "רגיל", advanced: "מתקדם", seminar: "מס" };
const BLOCK: Record<DegreeCourse["block"], string> = {
  math: "תשתית במתמטיקה",
  "cs-core": "חובה במדעי המחשב",
  "cs-elective": "בחירה במדעי המחשב",
  seminar: "סמינר",
  workshop: "סדנה",
  free: "בחירה חופשית",
};
const worst = (xs: Issue[]) => (xs.some((x) => x.severity === "error") ? "error" : xs.some((x) => x.severity === "warn") ? "warn" : null);

export function DegreePlanner({ initial, current, editable }: { initial: DegreePlan; current: string; editable: boolean }) {
  const [plan, setPlan] = useState(initial);
  const [undo, setUndo] = useState<DegreePlan | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const drag = useRef<string | null>(null);

  const commit = (next: DegreePlan, keepUndo?: DegreePlan) => {
    setPlan(next);
    setUndo(keepUndo ?? null);
    if (!editable) return;
    start(async () => {
      setError(null);
      try {
        await saveDegreePlan(next);
      } catch (e) {
        setError((e as Error).message || "לא נשמר");
      }
    });
  };
  const moveTo = (code: string, sem: string | null) => commit({ ...plan, items: plan.items.map((i) => (i.code === code ? { ...i, sem, credited: false } : i)) });
  const remove = (code: string) => commit({ ...plan, items: plan.items.filter((i) => i.code !== code) }, plan);
  const add = (code: string, sem: string | null) => commit({ ...plan, items: [...plan.items, { code, sem }] });
  const settings = (patch: Partial<DegreePlan["settings"]>) => commit({ ...plan, settings: { ...plan.settings, ...patch } });

  const reqs = useMemo(() => requirements(plan, current), [plan, current]);
  const t = useMemo(() => totals(plan, current), [plan, current]);
  const sems = useMemo(() => semestersOf(plan, current), [plan, current]);
  const todo = useMemo(() => actions(plan, current), [plan, current]);
  const issues = useMemo(() => Object.fromEntries(plan.items.map((i) => [i.code, itemIssues(plan, i, current)])), [plan, current]);
  const last = lastSemester(plan);
  const target = plan.settings.target;
  const onTime = !target || !last || semIndex(last) <= semIndex(target);
  const unplaced = plan.items.filter((i) => !i.sem && !i.credited);
  const credited = plan.items.filter((i) => i.credited);
  const past = sems.filter((s) => semIndex(s.sem) < semIndex(current));
  const ahead = sems.filter((s) => semIndex(s.sem) >= semIndex(current));
  const failed = reqs.filter((r) => !r.ok);
  const errorCount = Object.values(issues).flat().filter((x) => x.severity === "error").length;

  // semesters a course can move to: from the next one, ~5 years ahead
  const choices = useMemo(() => {
    const out: string[] = [];
    let s = current;
    for (let k = 0; k < 15; k++) {
      s = nextSemester(s, true);
      if (s.endsWith("ג") && !plan.settings.summers) continue;
      out.push(s);
    }
    return out;
  }, [current, plan.settings.summers]);

  const auto = () => {
    const before = plan;
    commit(autoPlan(plan, current), before);
  };

  const row = (i: PlanItem) => {
    const c = COURSE[i.code];
    const st = statusOf(i, current);
    const xs = issues[i.code] ?? [];
    const w = worst(xs);
    const movable = editable && (st === "planned" || st === null);
    const isOpen = open === i.code;
    return (
      <li
        key={i.code}
        draggable={movable}
        onDragStart={() => (drag.current = i.code)}
        className={`rounded-lg border ${w === "error" ? "border-bad" : "border-rule"} bg-[var(--surface)]`}
      >
        <button type="button" onClick={() => setOpen(isOpen ? null : i.code)} className="flex w-full items-center gap-2 px-3 py-2 text-start" aria-expanded={isOpen}>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{c?.name ?? i.code}</span>
            <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-soft">
              <span className="tabular-nums">{i.code}</span>
              {c && <span>{c.credits} נ&quot;ז</span>}
              {c && <span>{c.advanced ? "ר3+מ2" : LEVEL[c.level]}</span>}
              {c?.english && <span>אנגלית</span>}
              {st === "done" && <span className="text-ok">✓ הושלם</span>}
              {st === "now" && <span>בלימוד</span>}
            </span>
          </span>
          {w && (
            <span className={`grid size-5 place-items-center rounded-full text-[11px] font-bold ${w === "error" ? "bg-bad text-white" : "bg-highlight text-highlight-ink"}`} aria-label={w === "error" ? "בעיה" : "שימו לב"}>
              !
            </span>
          )}
        </button>
        {isOpen && (
          <div className="space-y-2 border-t border-rule px-3 py-2 text-sm">
            {c && <p className="text-ink-soft">{BLOCK[c.block]} · נפתח בדרך כלל: {c.offered.map((x) => `${x}׳`).join(", ")}</p>}
            {c?.needs?.length ? <p className="text-ink-soft">תנאי קדם: {c.needs.map((g) => g.map((x) => COURSE[x]?.name ?? x).join(" או ")).join(" · ")}</p> : null}
            {xs.length > 0 && (
              <ul className="space-y-1">
                {xs.map((x, k) => (
                  <li key={k} className={x.severity === "error" ? "text-bad" : x.severity === "warn" ? "" : "text-ink-soft"}>
                    {x.severity === "error" ? "✗ " : x.severity === "warn" ? "⚠ " : "· "}
                    {x.text}
                  </li>
                ))}
              </ul>
            )}
            {movable && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2">
                  <span className="text-ink-soft">סמסטר</span>
                  <select className="btn rounded-lg px-2" value={i.sem ?? ""} onChange={(e) => moveTo(i.code, e.target.value || null)}>
                    <option value="">לא משובץ</option>
                    {choices.map((s) => (
                      <option key={s} value={s}>
                        {semLabel(s)} · {seasonOf(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn-ghost rounded-lg px-2" onClick={() => remove(i.code)}>
                  הסרה מהתכנית
                </button>
              </div>
            )}
            <a className="inline-block text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink" href={`https://www.openu.ac.il/courses/${i.code}.htm`} target="_blank" rel="noreferrer">
              תיאור הקורס בקטלוג
            </a>
          </div>
        )}
      </li>
    );
  };

  const column = (s: { sem: string; items: PlanItem[]; credits: number }) => {
    const isNow = s.sem === current;
    const heavy = s.credits > plan.settings.perSemester + 2;
    return (
      <section
        key={s.sem}
        className={`panel flex flex-col p-3 ${isNow ? "ring-2 ring-ink/30" : ""}`}
        onDragOver={(e) => editable && semIndex(s.sem) > semIndex(current) && e.preventDefault()}
        onDrop={() => {
          if (drag.current && semIndex(s.sem) > semIndex(current)) moveTo(drag.current, s.sem);
          drag.current = null;
        }}
      >
        <header className="mb-2 flex items-baseline gap-2">
          <h3 className="section-title">{semLabel(s.sem)}</h3>
          <span className="text-sm text-ink-soft">{seasonOf(s.sem)}{isNow ? " · עכשיו" : ""}</span>
          <span className={`ms-auto text-sm tabular-nums ${heavy ? "text-bad" : "text-ink-soft"}`}>{s.credits} נ&quot;ז</span>
        </header>
        <ul className="space-y-2">{s.items.map(row)}</ul>
        {!s.items.length && <p className="rounded-lg border border-dashed border-rule p-3 text-center text-sm text-ink-soft">אפשר לגרור לכאן קורס</p>}
        <p className="mt-auto pt-2 text-xs text-ink-soft">{semMonths(s.sem)}</p>
      </section>
    );
  };

  const addable = COURSES.filter((c) => !plan.items.some((i) => i.code === c.code));

  return (
    <div className="mt-6 space-y-6">
      {/* summary */}
      <section className="panel grid gap-4 p-4 sm:grid-cols-[1fr_auto]">
        <div>
          <p className="text-sm text-ink-soft">נקודות זכות</p>
          <p className="font-display text-3xl tabular-nums">
            {t.done}
            <span className="text-lg text-ink-soft"> הושלמו · {t.now} בלימוד · {t.planned} מתוכננות · מתוך 120</span>
          </p>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-rule" aria-hidden>
            <div className="h-full bg-ink" style={{ width: `${(t.done / 120) * 100}%` }} />
            <div className="h-full bg-ink/50" style={{ width: `${(t.now / 120) * 100}%` }} />
            <div className="h-full bg-ink/20" style={{ width: `${(Math.min(t.planned, 120 - t.done - t.now) / 120) * 100}%` }} />
          </div>
        </div>
        <div className="sm:text-end">
          <p className="text-sm text-ink-soft">סיום משוער</p>
          <p className="font-display text-2xl">{last ? semLabel(last) : "—"}</p>
          <p className={`text-sm ${onTime ? "text-ok" : "text-bad"}`}>
            {last ? semMonths(last) : ""}
            {target ? (onTime ? ` · בתוך היעד (${semLabel(target)})` : ` · אחרי היעד (${semLabel(target)})`) : ""}
          </p>
        </div>
        <p className={`text-sm sm:col-span-2 ${failed.length || errorCount ? "text-bad" : "text-ok"}`}>
          {failed.length === 0 && errorCount === 0
            ? "✓ התכנית עומדת בכל דרישות התואר, ואין בעיות שיבוץ."
            : `${failed.length ? `${failed.length} דרישות עוד לא מתמלאות` : "כל הדרישות מתמלאות"}${errorCount ? ` · ${errorCount} בעיות שיבוץ` : ""}`}
          {saving ? <span className="text-ink-soft"> · שומר…</span> : null}
          {error ? <span className="text-bad"> · {error}</span> : null}
        </p>
      </section>

      {/* to do */}
      {todo.length > 0 && (
        <section className="panel p-4">
          <h2 className="section-title">מה לעשות</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {todo.map((a, k) => (
              <li key={k} className="flex gap-2">
                <span className={a.urgent ? "text-bad" : "text-ink-soft"}>{a.urgent ? "●" : "○"}</span>
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* semesters */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="section-title me-auto">סמסטר אחר סמסטר</h2>
          {editable && (
            <button type="button" className="btn rounded-lg px-3 text-sm" onClick={auto} title="משבץ מחדש את כל מה שעוד לא התחיל, לפי תנאי הקדם, ההיצע והקצב">
              <Icon name="sparkle" /> שיבוץ אוטומטי
            </button>
          )}
          {undo && (
            <button type="button" className="btn-ghost rounded-lg px-3 text-sm" onClick={() => commit(undo)}>
              <Icon name="undo" /> ביטול
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(past.length > 0 || credited.length > 0) && (
            <section className="panel p-3">
              <button type="button" className="flex w-full items-baseline gap-2 text-start" onClick={() => setShowPast(!showPast)} aria-expanded={showPast}>
                <h3 className="section-title">מה שכבר מאחוריי</h3>
                <span className="ms-auto text-sm text-ink-soft">
                  {credited.length + past.reduce((n, s) => n + s.items.length, 0)} קורסים · {showPast ? "הסתרה" : "הצגה"}
                </span>
              </button>
              {plan.recognized.map((r, k) => (
                <p key={k} className="mt-2 text-sm text-ink-soft">
                  {r.label}: {r.credits} נ&quot;ז
                </p>
              ))}
              {showPast && (
                <div className="mt-2 space-y-3">
                  {credited.length > 0 && (
                    <div>
                      <p className="mb-1 text-sm text-ink-soft">הכרה בלימודים קודמים</p>
                      <ul className="space-y-2">{credited.map(row)}</ul>
                    </div>
                  )}
                  {past.map((s) => (
                    <div key={s.sem}>
                      <p className="mb-1 text-sm text-ink-soft">
                        {semLabel(s.sem)} · {s.credits} נ&quot;ז
                      </p>
                      <ul className="space-y-2">{s.items.map(row)}</ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          {ahead.map(column)}
          {(unplaced.length > 0 || editable) && (
            <section
              className="panel flex flex-col p-3"
              onDragOver={(e) => editable && e.preventDefault()}
              onDrop={() => {
                if (drag.current) moveTo(drag.current, null);
                drag.current = null;
              }}
            >
              <header className="mb-2 flex items-baseline gap-2">
                <h3 className="section-title">עוד לא משובצים</h3>
                <span className="ms-auto text-sm text-ink-soft">{unplaced.reduce((n, i) => n + (COURSE[i.code]?.credits ?? 0), 0)} נ&quot;ז</span>
              </header>
              <ul className="space-y-2">{unplaced.map(row)}</ul>
              {editable && (
                <label className="mt-3 block text-sm">
                  <span className="text-ink-soft">הוספת קורס מהתכנית</span>
                  <select className="btn mt-1 w-full rounded-lg px-2" value="" onChange={(e) => e.target.value && add(e.target.value, null)}>
                    <option value="">בחירה…</option>
                    {(["math", "cs-core", "cs-elective", "seminar", "workshop"] as const).map((b) => {
                      const list = addable.filter((c) => c.block === b);
                      return list.length ? (
                        <optgroup key={b} label={BLOCK[b]}>
                          {list.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code} {c.name} ({c.credits})
                            </option>
                          ))}
                        </optgroup>
                      ) : null;
                    })}
                  </select>
                </label>
              )}
            </section>
          )}
        </div>
      </section>

      {/* requirements */}
      <section className="panel p-4">
        <h2 className="section-title">דרישות התואר</h2>
        <p className="mt-1 text-sm text-ink-soft">כולל מה שמתוכנן. הפס הכהה = מה שכבר הושלם.</p>
        <ul className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {reqs.map((r) => (
            <li key={r.id}>
              <div className="flex items-baseline gap-2">
                <span className={r.ok ? "text-ok" : "text-bad"} aria-label={r.ok ? "מתקיים" : "לא מתקיים"}>
                  {r.ok ? "✓" : "✗"}
                </span>
                <span className="min-w-0 flex-1">{r.label}</span>
                <span className="tabular-nums text-sm text-ink-soft">
                  {r.have}
                  {r.max ? " ≤ " : " / "}
                  {r.need}
                </span>
              </div>
              {!r.max && r.need > 0 && (
                <div className="ms-5 mt-1 flex h-1.5 overflow-hidden rounded-full bg-rule" aria-hidden>
                  <div className="h-full bg-ink" style={{ width: `${Math.min(100, (r.done / r.need) * 100)}%` }} />
                  <div className="h-full bg-ink/30" style={{ width: `${Math.max(0, Math.min(100, ((r.have - r.done) / r.need) * 100))}%` }} />
                </div>
              )}
              {r.detail && <p className="ms-5 mt-0.5 text-xs text-ink-soft">{r.detail}</p>}
            </li>
          ))}
          <li className="flex items-baseline gap-2">
            <span className={plan.settings.biblioDone ? "text-ok" : "text-bad"}>{plan.settings.biblioDone ? "✓" : "✗"}</span>
            <span className="flex-1">הדרכה ביבליוגרפית בספרייה</span>
          </li>
          <li className="flex items-baseline gap-2">
            <span className={plan.settings.englishExempt ? "text-ok" : "text-bad"}>{plan.settings.englishExempt ? "✓" : "✗"}</span>
            <span className="flex-1">פטור באנגלית</span>
          </li>
        </ul>
      </section>

      {/* settings */}
      {editable && (
        <section className="panel p-4">
          <h2 className="section-title">הגדרות התכנון</h2>
          <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex items-center gap-2">
              <span className="flex-1">נ&quot;ז בסמסטר (לשיבוץ האוטומטי)</span>
              <input
                type="number"
                min={4}
                max={30}
                className="btn w-20 rounded-lg px-2 tabular-nums"
                value={plan.settings.perSemester}
                onChange={(e) => settings({ perSemester: Math.max(4, Math.min(30, Number(e.target.value) || 4)) })}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="flex-1">לסיים עד</span>
              <select className="btn rounded-lg px-2" value={plan.settings.target ?? ""} onChange={(e) => settings({ target: e.target.value || null })}>
                <option value="">בלי יעד</option>
                {choices.map((s) => (
                  <option key={s} value={s}>
                    {semLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="flex-1">קורסי תוכן באנגלית שנדרשים</span>
              <select className="btn rounded-lg px-2" value={plan.settings.englishContent} onChange={(e) => settings({ englishContent: Number(e.target.value) })}>
                {[0, 1, 2].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={plan.settings.summers} onChange={(e) => settings({ summers: e.target.checked })} />
              <span>ללמוד גם בסמסטרי קיץ</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={plan.settings.biblioDone} onChange={(e) => settings({ biblioDone: e.target.checked })} />
              <span>השלמתי הדרכה ביבליוגרפית</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={plan.settings.englishExempt} onChange={(e) => settings({ englishExempt: e.target.checked })} />
              <span>יש לי פטור באנגלית</span>
            </label>
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            הנתונים מהידיעון, מקטלוג הקורסים ומהיצע הקורסים (נבדק 1.11.2026). ההיצע לסמסטרים רחוקים הוא לפי מה שנפתח בשנים קודמות, ולכן מסומן &quot;בדרך כלל&quot;. לפני ההרשמה כדאי
            לאשר את התכנית מול יועץ.ת אקדמי.ת.
          </p>
        </section>
      )}
    </div>
  );
}
