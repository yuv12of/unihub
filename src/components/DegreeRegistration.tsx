import Link from "next/link";
import { semLabel } from "@/lib/degree";
import { phaseLine, regDate, SHEILTA_REGISTRATION, type RegistrationState } from "@/lib/registration";

/**
 * Registration for upcoming semesters: the window, each planned course registered or not (from the last
 * Sheilta sync), and registrations the plan doesn't have. Used on /degree (with fix buttons) and on Today.
 */
export function DegreeRegistration({
  states,
  syncedAt,
  compact = false,
  onPlace,
}: {
  states: RegistrationState[];
  syncedAt: string | null;
  compact?: boolean;
  /** put a registered course into the plan's semester (add or move); /degree only */
  onPlace?: (code: string, sem: string) => void;
}) {
  if (!states.length) return null;
  return (
    <section id="registration" className="panel scroll-mt-24 p-4">
      <h2 className="section-title">הרשמה</h2>
      <div className="mt-2 space-y-4">
        {states.map((s) => {
          const w = s.window;
          const allIn = s.synced && s.missing === 0 && !s.extra.length;
          return (
            <div key={w.sem}>
              <p className={`font-medium ${s.phase === "late" || (s.phase === "regular" && s.daysLeft <= 7) ? "text-bad" : ""}`}>{phaseLine(s)}</p>
              {!compact && (
                <p className="text-xs text-ink-soft">
                  הרשמה סדירה {regDate(w.regular[0])}–{regDate(w.regular[1])} · מאוחרת עד {regDate(w.late[1])} · הסמסטר נפתח ב־{regDate(w.starts)}
                  {w.estimated ? " · תאריכים משוערים לפי השנה הקודמת" : ""}
                </p>
              )}
              {allIn ? (
                <p className="mt-1 text-sm text-ok">✓ רשום לכל הקורסים של {semLabel(w.sem)} לפי התכנית.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {s.rows.map((r) => (
                    <li key={r.code} className="flex items-baseline gap-2">
                      <span className={r.registered ? "text-ok" : r.registered === false ? "text-bad" : "text-ink-soft"} aria-hidden>
                        {r.registered ? "✓" : r.registered === false ? "✗" : "?"}
                      </span>
                      <span className="flex-1">{r.name}</span>
                      <span className="text-xs text-ink-soft">{r.registered ? "רשום" : r.registered === false ? "עוד לא רשום" : "לא ידוע"}</span>
                    </li>
                  ))}
                  {s.extra.map((x) => (
                    <li key={x.code} className="flex flex-wrap items-baseline gap-2">
                      <span className="text-highlight-ink" aria-hidden>
                        +
                      </span>
                      <span className="flex-1">
                        {x.name} <span className="text-xs text-ink-soft">— רשום בשאילתא, {x.plannedIn ? `בתכנית ב${semLabel(x.plannedIn)}` : "לא בתכנית"}</span>
                      </span>
                      {onPlace && (
                        <button type="button" className="btn rounded-lg px-2 text-xs" onClick={() => onPlace(x.code, w.sem)}>
                          {x.plannedIn ? `להעביר ל${semLabel(w.sem)}` : "להוסיף לתכנית"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <a className="btn-primary rounded-lg px-3" href={SHEILTA_REGISTRATION} target="_blank" rel="noreferrer">
          להרשמה בשאילתא
        </a>
        <Link className="btn rounded-lg px-3" href="/degree/sync">
          סנכרון משאילתא
        </Link>
        {compact && (
          <Link className="btn-ghost rounded-lg px-3" href="/degree#registration">
            לתכנית
          </Link>
        )}
        <span className="text-xs text-ink-soft">{syncedAt ? `סונכרן ${ago(syncedAt)}` : "עוד לא סונכרן: מצב ההרשמה לא ידוע"}</span>
      </div>
    </section>
  );
}

export function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 2) return "עכשיו";
  if (min < 60) return `לפני ${min} דק׳`;
  const h = Math.round(min / 60);
  if (h < 24) return `לפני ${h} ש׳`;
  const d = Math.round(h / 24);
  return d === 1 ? "אתמול" : `לפני ${d} ימים`;
}
