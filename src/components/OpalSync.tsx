"use client";

import { useState, useTransition } from "react";
import { saveOpalFeed, syncOpalNow } from "@/app/actions";
import type { OpalFeed } from "@/lib/userdata";

const when = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function OpalSync({ feed }: { feed: OpalFeed | null }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = (fd: FormData) =>
    start(async () => {
      setError(null);
      setMsg(null);
      try {
        await saveOpalFeed(fd);
        if (String(fd.get("url") ?? "").trim()) {
          const r = await syncOpalNow();
          setMsg(r.opal === "ok" ? `סונכרן: ${r.events} אירועים מאופל.` : `נשמר. הסנכרון ינסה שוב בעוד שעה (${r.message ?? r.opal}).`);
        } else setMsg("הקישור הוסר.");
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
            <a
              href="https://opal.openu.ac.il/calendar/export.php"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4 decoration-rule hover:decoration-current"
            >
              יצוא לוח שנה באופל
            </a>{" "}
            (מחוברים לאופל).
          </li>
          <li>
            בחרו <b>כל האירועים</b> ו־<b>טווח מותאם</b> (או 60 הימים הקרובים), ולחצו <b>קבלת כתובת ה-URL של לוח השנה</b>.
          </li>
          <li>העתיקו את הכתובת שמופיעה והדביקו אותה כאן.</li>
        </ol>
      )}
      <form action={save} className="flex flex-wrap gap-2">
        <input
          name="url"
          type="url"
          dir="ltr"
          defaultValue={feed?.url ?? ""}
          key={feed?.url ?? "none"}
          placeholder="https://opal.openu.ac.il/calendar/export_execute.php?…"
          className="min-w-0 flex-1 rounded-lg border border-rule bg-surface px-3 py-2 text-sm"
          aria-label="קישור יצוא לוח השנה מאופל"
          readOnly={!!feed}
        />
        {feed ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await syncOpalNow().catch((e) => ({ opal: "error", message: String(e?.message ?? e) }) as const);
                  setMsg(r.opal === "ok" ? `סונכרן: ${"events" in r ? r.events : 0} אירועים.` : `לא הצליח: ${"message" in r ? r.message : r.opal}`);
                })
              }
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg disabled:opacity-60"
            >
              {pending ? "מסנכרן…" : "סנכרון עכשיו"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => save(new FormData())}
              className="rounded-lg px-3 py-2 text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink"
            >
              הסרה
            </button>
          </>
        ) : (
          <button disabled={pending} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg disabled:opacity-60">
            {pending ? "שומר…" : "חיבור"}
          </button>
        )}
      </form>
      {feed && (
        <p className="text-sm text-ink-soft">
          {feed.last_synced_at ? `סנכרון אחרון: ${when(feed.last_synced_at)}` : "עוד לא סונכרן"}
          {feed.last_status && feed.last_status !== "ok" ? ` · ${feed.last_status}` : feed.last_count != null ? ` · ${feed.last_count} אירועים` : ""}
          . מתעדכן לבד כל שעה דרך הסקריפט של Google.
        </p>
      )}
      {msg && <p className="text-sm">{msg}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
