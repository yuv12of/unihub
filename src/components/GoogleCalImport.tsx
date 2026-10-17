"use client";

import { useState, useTransition } from "react";
import { saveGoogleFeed, syncGoogleNow } from "@/app/actions";
import type { OpalFeed } from "@/lib/userdata";

const when = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Google Calendar → Unihub: paste the calendar's secret iCal address once. */
export function GoogleCalImport({ feed }: { feed: OpalFeed | null }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; count?: number; message?: string }>, removed = false) =>
    start(async () => {
      setError(null);
      setMsg(null);
      try {
        const r = await fn();
        setMsg(removed ? "החיבור הוסר והאירועים שיובאו נמחקו." : r.ok ? `סונכרן: ${r.count} אירועים מיומן Google.` : `לא הצליח: ${r.message}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה");
      }
    });

  return (
    <div className="mt-4 space-y-4">
      {!feed && (
        <ol className="list-decimal space-y-1.5 ps-5 text-sm leading-relaxed">
          <li>
            פתחו את{" "}
            <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4 decoration-rule hover:decoration-current">
              הגדרות יומן Google
            </a>{" "}
            במחשב.
          </li>
          <li>
            בצד, תחת <b>הגדרות של היומנים שלי</b>, בחרו את היומן שלכם וגללו ל־<b>שילוב היומן</b>.
          </li>
          <li>
            העתיקו את <b>הכתובת הסודית בפורמט iCal</b> והדביקו כאן.
          </li>
        </ol>
      )}
      <form
        action={(fd) => run(() => saveGoogleFeed(String(fd.get("url") ?? "")))}
        className="flex flex-wrap gap-2"
      >
        <input
          name="url"
          type="url"
          dir="ltr"
          defaultValue={feed?.url ?? ""}
          key={feed?.url ?? "none"}
          readOnly={!!feed}
          placeholder="https://calendar.google.com/calendar/ical/…/private-…/basic.ics"
          className="min-w-0 flex-1 rounded-lg border border-rule bg-surface px-3 py-2 text-sm"
          aria-label="הכתובת הסודית של יומן Google"
        />
        {feed ? (
          <>
            <button type="button" disabled={pending} onClick={() => run(syncGoogleNow)} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg disabled:opacity-60">
              {pending ? "מסנכרן…" : "סנכרון עכשיו"}
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => saveGoogleFeed(""), true)} className="rounded-lg px-3 py-2 text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">
              הסרה
            </button>
          </>
        ) : (
          <button disabled={pending} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg disabled:opacity-60">
            {pending ? "מחבר…" : "חיבור"}
          </button>
        )}
      </form>
      {feed && (
        <p className="text-sm text-ink-soft">
          {feed.last_synced_at ? `סנכרון אחרון: ${when(feed.last_synced_at)}` : "עוד לא סונכרן"}
          {feed.last_status && feed.last_status !== "ok" ? ` · ${feed.last_status}` : feed.last_count != null ? ` · ${feed.last_count} אירועים` : ""}
          . מתעדכן לבד בערך כל חצי שעה.
        </p>
      )}
      {msg && <p className="text-sm">{msg}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
