"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { importSheilta } from "@/app/act";
import { ago } from "@/components/DegreeRegistration";
import { bookmarklet, type SyncChange } from "@/lib/sheilta";

type Result = { changes: SyncChange[]; count: number; syncedAt: string };

/**
 * Receives the bookmarklet's data (#d=… in the URL, read here in the browser and sent to the server
 * action) and explains how to set the bookmark up. A paste box is the fallback.
 */
export function SheiltaSync({ last, editable }: { last: { syncedAt: string; count: number } | null; editable: boolean }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [paste, setPaste] = useState("");
  const [busy, start] = useTransition();
  const link = useRef<HTMLAnchorElement>(null);
  const ran = useRef(false);

  const run = (data: unknown) =>
    start(async () => {
      setError(null);
      try {
        setResult(await importSheilta(data));
      } catch (e) {
        setError((e as Error).message || "הסנכרון נכשל");
      }
    });

  useEffect(() => {
    const c = bookmarklet(window.location.origin);
    // React won't render a javascript: href, so the draggable link gets it directly
    link.current?.setAttribute("href", c);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the code depends on this page's origin, known only in the browser
    setCode(c);
    if (ran.current) return;
    ran.current = true;
    const m = window.location.hash.match(/^#d=(.+)$/);
    if (!m) return;
    history.replaceState(null, "", window.location.pathname);
    try {
      run(JSON.parse(decodeURIComponent(m[1])));
    } catch {
      setError("הנתונים מהשאילתא לא נקראו. לנסות שוב מהסימנייה.");
    }
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-6 max-w-3xl space-y-6">
      {(busy || result || error) && (
        <section className="panel p-4" aria-live="polite">
          {busy && <p>מסנכרן…</p>}
          {error && <p className="text-bad">{error}</p>}
          {result && (
            <>
              <p className="font-medium text-ok">✓ נקראו {result.count} רשומות מהשאילתא.</p>
              {result.changes.length ? (
                <>
                  <p className="mt-2 text-sm">מה התעדכן בתכנית:</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {result.changes.map((c, k) => (
                      <li key={k} className={c.kind === "failed" ? "text-bad" : ""}>
                        · {c.text}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-1 text-sm text-ink-soft">אין שינויים בתכנית. מצב ההרשמה מעודכן בעמוד התכנית.</p>
              )}
              <Link href="/degree#registration" className="btn-primary mt-3 inline-block rounded-lg px-3">
                לתכנית התואר
              </Link>
            </>
          )}
        </section>
      )}

      <section className="panel p-4">
        <h2 className="section-title">הסימנייה</h2>
        <p className="mt-1 text-sm text-ink-soft">{last ? `סונכרן ${ago(last.syncedAt)}, ${last.count} רשומות.` : "עוד לא סונכרן."}</p>
        <ol className="mt-3 list-decimal space-y-2 ps-5 text-sm">
          <li>
            <span className="font-medium">מחשב:</span> גוררים את הכפתור הזה לסרגל הסימניות:{" "}
            <a ref={link} className="btn ms-1 inline-block rounded-lg px-3" onClick={(e) => e.preventDefault()} draggable>
              סנכרון ל־Unihub
            </a>
          </li>
          <li>
            <span className="font-medium">אייפד / אייפון (Safari):</span> מעתיקים את הקוד, מוסיפים לסימניות דף כלשהו, עורכים את הסימנייה ומחליפים את הכתובת שלה בקוד. שם: &quot;סנכרון ל־Unihub&quot;.
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn rounded-lg px-3" onClick={copy} disabled={!code}>
                {copied ? "הועתק ✓" : "העתקת הקוד"}
              </button>
            </div>
          </li>
          <li>
            נכנסים ל
            <a className="underline decoration-rule underline-offset-4" href="https://sheilta.apps.openu.ac.il/Main/Courses" target="_blank" rel="noreferrer">
              שאילתא
            </a>
            , מתחברים, ולוחצים על הסימנייה. הדף הזה נפתח עם הנתונים ומעדכן את התכנית.
          </li>
        </ol>
        <p className="mt-3 text-xs text-ink-soft">
          מה הסימנייה עושה: קוראת את רשימת הקורסים שלך מהשאילתא (מספר, שם, סמסטר, מצב, ציון) ופותחת את הדף הזה איתה. מה שמתעדכן: קורס שעברת מסומן &quot;הושלם&quot; עם הציון; קורס שלא הושלם
          חוזר ל&quot;עוד לא משובצים&quot;; מצב ההרשמה לסמסטרים הבאים מושווה לתכנית.
        </p>
      </section>

      {editable && (
        <section className="panel p-4">
          <h2 className="section-title">בלי סימנייה</h2>
          <p className="mt-1 text-sm text-ink-soft">
            פותחים בשאילתא (מחובר/ת) את{" "}
            <a className="underline decoration-rule underline-offset-4" href="https://sheilta.apps.openu.ac.il/Main/api/coursesApi/get" target="_blank" rel="noreferrer" dir="ltr">
              Main/api/coursesApi/get
            </a>
            , מסמנים הכול, מעתיקים ומדביקים כאן.
          </p>
          <textarea dir="ltr" className="btn mt-2 h-28 w-full rounded-lg p-2 font-mono text-xs" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='[{"courseId":"20109", …}]' />
          <button type="button" className="btn-primary mt-2 rounded-lg px-3" disabled={!paste.trim() || busy} onClick={() => run(paste)}>
            ייבוא
          </button>
        </section>
      )}
    </div>
  );
}
