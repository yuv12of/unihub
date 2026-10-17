import { Fold, Gallery } from "@/components/Fold";
import { BADGE_GROUPS, type Badge } from "@/lib/badges";

export function BadgeGrid({ badges, compact = false }: { badges: Badge[]; compact?: boolean }) {
  const earned = badges.filter((b) => b.earned);
  if (compact)
    return earned.length ? (
      <ul className="flex flex-wrap gap-1.5">
        {earned.map((b) => (
          <li key={b.id} title={`${b.title}: ${b.desc}`} className="grid size-9 place-items-center rounded-full bg-highlight/40 text-lg">
            {b.emoji}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-ink-soft">עוד אין תגים.</p>
    );
  const groups = (Object.keys(BADGE_GROUPS) as Badge["group"][]).map((g) => ({ g, list: badges.filter((b) => b.group === g) })).filter((x) => x.list.length);
  // Closest to unlocking first: that's what's worth knowing today.
  const close = badges
    .filter((b) => !b.earned && b.target > 0)
    .sort((a, b) => b.value / b.target - a.value / a.target)
    .slice(0, 3);
  return (
    <div className="space-y-5">
      {earned.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink-soft">
            הרווחת {earned.length} מתוך {badges.length}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {earned.map((b) => (
              <li key={b.id} className="flex items-center gap-1.5 rounded-full bg-highlight/30 px-3 py-1 text-sm" title={b.desc}>
                <span aria-hidden>{b.emoji}</span>
                {b.title}
              </li>
            ))}
          </ul>
        </div>
      )}
      {close.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink-soft">הכי קרובים</h3>
          <ul className="grid gap-2 sm:grid-cols-3">
            {close.map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-xl border border-rule bg-surface p-3">
                <span className="text-2xl opacity-60 grayscale" aria-hidden>
                  {b.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{b.title}</span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-rule">
                    <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.min(100, (b.value / b.target) * 100)}%` }} />
                  </span>
                  <span className="text-[11px] tabular-nums text-ink-soft">
                    {b.value}/{b.target}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Fold id="badges-all" title="כל התגים" summary={`${badges.length} תגים ב־${groups.length} קבוצות`} defaultOpen={false} bare>
      <div className="space-y-5">
      {groups.map(({ g, list }) => (
        <div key={g}>
          <h3 className="mb-2 text-sm font-semibold text-ink-soft">{BADGE_GROUPS[g]}</h3>
          <Gallery cols="sm:grid-cols-3 lg:grid-cols-4" item="[&>*]:w-[44%]">
            {list.map((b) => (
              <div
                key={b.id}
                className={`rounded-xl border p-3 ${b.earned ? "border-transparent bg-highlight/25" : "border-rule bg-surface"}`}
              >
                <div className={`text-2xl ${b.earned ? "" : "opacity-35 grayscale"}`} aria-hidden>
                  {b.emoji}
                </div>
                <div className="mt-1 text-sm font-semibold leading-tight">{b.title}</div>
                <div className="text-xs text-ink-soft">{b.desc}</div>
                {!b.earned && b.target > 1 && (
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-rule">
                      <div className="h-full rounded-full bg-ink" style={{ width: `${(b.value / b.target) * 100}%` }} />
                    </div>
                    <div className="mt-0.5 text-[11px] tabular-nums text-ink-soft">
                      {b.value}/{b.target}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </Gallery>
        </div>
      ))}
      </div>
      </Fold>
    </div>
  );
}
