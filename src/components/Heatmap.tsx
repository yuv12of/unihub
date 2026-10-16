/** GitHub-style grid of study minutes per day: a column per week, newest on the left (RTL). */
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const DAY = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

export function Heatmap({ days, today, weeks = 16, color = "var(--c-green)" }: { days: Record<string, number>; today: string; weeks?: number; color?: string }) {
  const thisWeek = addDays(today, -new Date(today + "T00:00:00Z").getUTCDay());
  const cols = Array.from({ length: weeks }, (_, i) => addDays(thisWeek, -7 * (weeks - 1 - i)));
  const level = (m: number) => (m <= 0 ? 0 : m < 30 ? 0.25 : m < 60 ? 0.45 : m < 120 ? 0.7 : 1);
  const total = Object.entries(days).filter(([d]) => d >= cols[0] && d <= today).reduce((n, [, m]) => n + m, 0);
  const activeDays = Object.entries(days).filter(([d, m]) => d >= cols[0] && d <= today && m > 0).length;
  return (
    <figure>
      <div className="flex gap-1" dir="ltr" aria-hidden>
        <div className="me-1 flex flex-col gap-1 text-[9px] leading-[11px] text-ink-soft">
          {DAY.map((d) => (
            <span key={d} className="h-[11px]">
              {d}
            </span>
          ))}
        </div>
        {cols.map((ws) => (
          <div key={ws} className="flex flex-col gap-1">
            {Array.from({ length: 7 }, (_, i) => {
              const d = addDays(ws, i);
              const m = days[d] ?? 0;
              const future = d > today;
              return (
                <span
                  key={d}
                  title={future ? undefined : `${d.slice(8)}/${d.slice(5, 7)}: ${m ? `${m} דק׳` : "—"}`}
                  className="size-[11px] rounded-[3px]"
                  style={{
                    background: future ? "transparent" : m ? `color-mix(in srgb, ${color} ${Math.round(level(m) * 100)}%, var(--rule))` : "var(--rule)",
                    outline: d === today ? "1.5px solid var(--ink)" : undefined,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <figcaption className="mt-2 text-xs text-ink-soft">
        {Math.round(total / 60)} שעות לימוד ב־{activeDays} ימים, ב־{weeks} השבועות האחרונים
      </figcaption>
    </figure>
  );
}
