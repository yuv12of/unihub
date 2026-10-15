import {
  addDays,
  courseTheme,
  daysBetween,
  formatHebrewDate,
  semester,
  typeLabel,
} from "@/lib/semester";

/** Sunday of the week containing `iso` (Israeli weeks start on Sunday). */
function weekStart(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return addDays(iso, -d.getUTCDay());
}

/**
 * The semester at a glance: one column per week, one row per course.
 * Each dot is an assignment; its size is its grade weight. Weeks where
 * several courses are due close together get a highlighter band.
 */
export function Timeline({ today }: { today: string }) {
  const all = semester.courses.flatMap((c) => c.assignments.map((a) => a.due));
  const last = all.sort().at(-1)!;
  const start = weekStart(today);
  const weeks: string[] = [];
  for (let w = start; w <= addDays(last, 0); w = addDays(w, 7)) weeks.push(w);

  const weekIndex = (iso: string) => Math.floor(daysBetween(start, iso) / 7);
  const loadPerWeek = weeks.map(() => 0);
  for (const c of semester.courses)
    for (const a of c.assignments) {
      const i = weekIndex(a.due);
      if (i >= 0 && i < weeks.length) loadPerWeek[i] += 1;
    }

  const todayCol = weekIndex(today);

  return (
    <figure className="mt-2" aria-label="מפת המטלות של הסמסטר לפי שבועות">
      <div className="overflow-x-auto pb-2 -mx-4 px-4">
        <div
          className="grid gap-y-2 min-w-[340px]"
          style={{ gridTemplateColumns: `4.75rem repeat(${weeks.length}, minmax(0, 1fr))` }}
        >
          {/* month labels */}
          <div />
          {weeks.map((w, i) => {
            const first = i === 0 || w.slice(5, 7) !== weeks[i - 1].slice(5, 7);
            return (
              <div key={w} className="text-[11px] text-ink-soft h-4 whitespace-nowrap">
                {first ? formatHebrewDate(w, { month: "short" }) : ""}
              </div>
            );
          })}

          {/* crunch weeks */}
          <div className="text-xs text-ink-soft self-center">עומס</div>
          {loadPerWeek.map((n, i) => (
            <div key={i} className="h-2 flex items-center justify-center">
              {n >= 2 && (
                <span
                  className="block h-2 w-full rounded-full"
                  style={{ background: "var(--highlight)", opacity: n >= 3 ? 1 : 0.55 }}
                  title={`${n} מטלות בשבוע הזה`}
                />
              )}
            </div>
          ))}

          {semester.courses.map((c) => {
            const theme = courseTheme[c.code];
            return (
              <Row key={c.code}>
                <div className="text-sm font-medium self-center truncate" style={{ color: theme.color }}>
                  {theme.short}
                </div>
                {weeks.map((w, i) => {
                  const due = c.assignments.filter((a) => weekIndex(a.due) === i);
                  return (
                    <div
                      key={w}
                      className="relative h-7 flex items-center justify-center gap-0.5 border-s border-rule/60"
                    >
                      {i === todayCol && (
                        <span className="absolute inset-y-0 start-1/2 w-0.5 bg-ink rounded" aria-hidden />
                      )}
                      {due.map((a) => {
                        const size = 5 + a.weight * 1.6;
                        const label = `${theme.short} ${typeLabel[a.type]} ${a.n} · ${formatHebrewDate(a.due, { day: "numeric", month: "numeric" })} · משקל ${a.weight}`;
                        return (
                          <span
                            key={a.n}
                            title={label}
                            aria-label={label}
                            className="rounded-full shrink-0"
                            style={{
                              width: size,
                              height: size,
                              background: a.type === "file" ? theme.color : "transparent",
                              border: `2px solid ${theme.color}`,
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </Row>
            );
          })}
        </div>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-ink" /> ממ״ן
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-2 border-ink" /> ממ״ח / השתתפות
        </span>
        <span>גודל הנקודה = משקל המטלה</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-0.5 h-3 bg-ink rounded" /> השבוע
        </span>
      </figcaption>
    </figure>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
