"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { mailHtml, markMailRead } from "@/app/act";
import type { Mail } from "@/lib/userdata";
import { Icon } from "@/components/Icon";

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

export function MailBox({ mails, editable, initialOpen }: { mails: Mail[]; editable: boolean; initialOpen?: string }) {
  const [openId, setOpenId] = useState<string | null>(initialOpen && mails.some((m) => m.id === initialOpen) ? initialOpen : null);
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [readLocal, setReadLocal] = useState<Set<string>>(new Set());
  const [, start] = useTransition();

  const categories = useMemo(
    () => [...new Set(mails.map((m) => m.category).filter(Boolean))] as string[],
    [mails],
  );
  const isRead = (m: Mail) => m.is_read || readLocal.has(m.id);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = mails.filter(
    (m) =>
      (filter === "all" ? true : filter === "unread" ? !isRead(m) : m.category === filter) &&
      words.every((w) =>
        `${m.subject ?? ""} ${m.summary ?? ""} ${m.body_text ?? ""} ${m.attachments.map((a) => a.filename).join(" ")}`.toLowerCase().includes(w),
      ),
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
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש בדואר…"
          aria-label="חיפוש בדואר"
          className="mb-3 w-full rounded-lg border border-rule bg-surface px-3 py-2 text-[15px] outline-none focus:border-ink"
        />
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
                    {m.attachments.length > 0 && <span className="inline-flex items-center gap-0.5"><Icon name="clip" className="size-3" />{m.attachments.length}</span>}
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
              {open.action_items && open.action_items.some((a) => a.text) && (
                <ul className="mt-2 list-disc space-y-0.5 ps-5 text-sm">
                  {open.action_items.filter((a) => a.text).map((a, i) => (
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
                      <Icon name="clip" className="size-4 shrink-0" />
                      {a.filename}
                    </a>
                  </li>
                ))}
              </ul>
            )}

            <MailBody key={open.id} mail={open} />
          </article>
        ) : (
          <div className="panel grid min-h-60 place-items-center p-6 text-ink-soft">בחרו הודעה מהרשימה.</div>
        )}
      </div>
    </div>
  );
}

/** Shows the original formatted email (images, links) safely; falls back to readable text. */
function MailBody({ mail }: { mail: Mail }) {
  const [html, setHtml] = useState<string | null>(mail.body_html ?? null);
  const [mode, setMode] = useState<"html" | "text">("html");
  useEffect(() => {
    if (mail.body_html !== undefined) return;
    let live = true;
    mailHtml(mail.id).then((h) => live && setHtml(h), () => {});
    return () => {
      live = false;
    };
  }, [mail.id, mail.body_html]);
  // Plain-text emails also arrive with a "html" copy that is just the text: no tags, so newlines
  // would collapse in the frame. Only real HTML gets the formatted view.
  mail = { ...mail, body_html: html && /<(html|body|div|p|br|table|span|a|img|font|b|strong)\b/i.test(html) ? html : null };
  const text = clean(mail.body_text);
  return (
    <div className="mt-5 border-t border-rule pt-4">
      {mail.body_html && (
        <div className="mb-3 flex justify-end">
          <div className="flex rounded-lg border border-rule p-0.5 text-xs" role="tablist" aria-label="תצוגת ההודעה">
            {(["html", "text"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-md px-2.5 py-1 ${mode === m ? "bg-ink text-bg" : "text-ink-soft"}`}
              >
                {m === "html" ? "מעוצב" : "טקסט"}
              </button>
            ))}
          </div>
        </div>
      )}
      {mode === "html" && mail.body_html ? (
        <HtmlFrame html={mail.body_html} />
      ) : text ? (
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed" dir="auto">
          <Linkified text={text} />
        </div>
      ) : (
        <span className="text-ink-soft">אין טקסט בהודעה. התוכן נמצא בקבצים המצורפים.</span>
      )}
    </div>
  );
}

/**
 * Renders email HTML in a sandboxed frame: scripts never run, links open in a new tab,
 * and the frame grows to fit its content.
 */
function HtmlFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(400);
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
<meta name="referrer" content="no-referrer">
<style>body{margin:0;padding:12px;font-family:Arial,sans-serif;direction:rtl;background:#fff;color:#111;word-wrap:break-word}
img{max-width:100%!important;height:auto!important}table{max-width:100%!important}a{color:#1a56c4}</style></head>
<body>${html}</body></html>`;
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const measure = () => {
      const h = frame.contentDocument?.documentElement.scrollHeight;
      if (h) setHeight(Math.min(h + 8, 6000));
    };
    frame.addEventListener("load", measure);
    const t = setInterval(measure, 500); // images load after the document
    const stop = setTimeout(() => clearInterval(t), 6000);
    return () => {
      frame.removeEventListener("load", measure);
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [html]);
  return (
    <iframe
      ref={ref}
      title="תוכן ההודעה"
      srcDoc={doc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="w-full rounded-lg border border-rule bg-white"
      style={{ height }}
    />
  );
}

/** Turns bare URLs in plain text into links. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"״׳])/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all text-[color:var(--c-algebra)] underline underline-offset-2" dir="ltr">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
