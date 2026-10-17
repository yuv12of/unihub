import { Gallery } from "@/components/Fold";
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
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-soft">
        {earned.length} מתוך {badges.length} תגים
      </p>
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
  );
}
