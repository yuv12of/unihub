"use client";

import { useMemo, useState, useTransition } from "react";
import { markMailRead } from "@/app/actions";
import type { Mail } from "@/lib/userdata";

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    ...(sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }),
  }).format(d);
};
const fullDate = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "full", timeStyle: "short" }).format(new Date(iso));

/** Make university plaintext readable: drop layout-table debris and boilerplate footers. */
function clean(body: string | null) {
  if (!body) return "";
  return body
    .split("\n")
    .map((l) => l.replace(/\[\]\([^)]*\)/g, "").replace(/^\|[\s|]*\|?$/, "").replace(/^\|\s*|\s*\|$/g, "").trim())
    .filter((l) => !/This message was sent from an email box|הודעה זו נשלחה מתיבת דואר|If You cannot see this message/i.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function MailBox({ mails, editable }: { mails: Mail[]; editable: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [readLocal, setReadLocal] = useState<Set<string>>(new Set());
  const [, start] = useTransition();

  const categories = useMemo(
    () => [...new Set(mails.map((m) => m.category).filter(Boolean))] as string[],
    [mails],
  );
  const isRead = (m: Mail) => m.is_read || readLocal.has(m.id);
  const shown = mails.filter((m) =>
    filter === "all" ? true : filter === "unread" ? !isRead(m) : m.category === filter,
  );
  const open = mails.find((m) => m.id === openId) ?? null;

  const select = (m: Mail) => {
    setOpenId(m.id);
    if (!isRead(m) && editable) {
      setReadLocal((s) => new Set(s).add(m.id));
      start(() => markMailRead(m.id));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <div className={`${open ? "hidden lg:block" : ""} min-w-0`}>
        <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="סינון">
          {[["all", "הכל"], ["unread", "לא נקראו"], ...categories.map((c) => [c, c])].map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={filter === k}
              onClick={() => setFilter(k)}
              className={`rounded-full border px-3 py-1 text-sm ${
                filter === k ? "border-ink bg-ink text-bg" : "border-rule text-ink-soft hover:border-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <ul className="panel max-h-[70vh] divide-y divide-rule overflow-y-auto">
          {shown.length === 0 && <li className="px-4 py-6 text-ink-soft">אין הודעות כאן.</li>}
          {shown.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => select(m)}
                className={`block w-full px-4 py-3 text-start ${m.id === openId ? "bg-bg" : "hover:bg-bg/60"}`}
              >
                <div className="flex items-baseline gap-2">
                  {!isRead(m) && <span className="size-2 shrink-0 rounded-full bg-ink" aria-label="לא נקרא" />}
                  <span className={`min-w-0 flex-1 truncate ${isRead(m) ? "" : "font-semibold"}`}>
                    {m.subject || "(ללא נושא)"}
                  </span>
                  <span className="shrink-0 text-xs text-ink-soft tabular-nums">{when(m.received_at)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">
                  {m.summary ?? clean(m.body_text).slice(0, 160)}
                </p>
                {(m.category || m.attachments.length > 0) && (
                  <div className="mt-1 flex gap-2 text-[11px] text-ink-soft">
                    {m.category && <span className="rounded bg-rule/70 px-1.5 py-0.5">{m.category}</span>}
                    {m.attachments.length > 0 && <span>📎 {m.attachments.length}</span>}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={`${open ? "" : "hidden lg:block"} min-w-0`}>
        {open ? (
          <article className="panel p-5 sm:p-6">
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className="mb-3 text-sm text-ink-soft underline underline-offset-4 decoration-rule lg:hidden"
            >
              חזרה לרשימה
            </button>
            <h2 className="text-xl font-semibold leading-snug">{open.subject || "(ללא נושא)"}</h2>
            <p className="mt-1 text-sm text-ink-soft">{fullDate(open.received_at)}</p>

            <section className="mt-4 rounded-xl bg-bg px-4 py-3">
              <h3 className="text-sm font-semibold">בקצרה</h3>
              {open.summary ? (
                <p className="mt-1 leading-relaxed">{open.summary}</p>
              ) : (
                <p className="mt-1 text-sm text-ink-soft">הסיכום יתווסף בסבב העיבוד הבא (כל כמה שעות).</p>
              )}
              {open.action_items && open.action_items.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 ps-5 text-sm">
                  {open.action_items.map((a, i) => (
                    <li key={i}>
                      {a.text}
                      {a.date ? <span className="text-ink-soft"> ({a.date})</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {open.attachments.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {open.attachments.map((a) => (
                  <li key={a.id}>
                    <a
                      href={`/api/mail/attachment/${a.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rule px-3 py-1.5 text-sm hover:border-ink"
                      dir="ltr"
                    >
                      📎 {a.filename}
                    </a>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 whitespace-pre-wrap border-t border-rule pt-4 text-[15px] leading-relaxed" dir="auto">
              {clean(open.body_text) || <span className="text-ink-soft">אין טקסט בהודעה. התוכן נמצא בקבצים המצורפים.</span>}
            </div>
          </article>
        ) : (
          <div className="panel grid min-h-60 place-items-center p-6 text-ink-soft">בחרו הודעה מהרשימה.</div>
        )}
      </div>
    </div>
  );
}
