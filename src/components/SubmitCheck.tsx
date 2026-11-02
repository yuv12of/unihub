"use client";

import { useEffect, useState } from "react";
import { getSubmitCheck } from "@/app/act";
import type { SubmitCheck as Data } from "@/app/assignmentFileActions";
import { Icon } from "@/components/Icon";
import { CHECKLIST } from "@/lib/tracker";
import { PART_PREFIX } from "@/lib/sheetStructure";

const when = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * "Ready to submit": every part the sheet asks for (ticked by me, never judged), what can be
 * checked about my Notability solution, and the submission checklist.
 */
export function SubmitCheck({
  code,
  n,
  color,
  daysLeft,
  checks,
  editable,
  pending,
  onToggle,
}: {
  code: string;
  n: string;
  color: string;
  daysLeft: number;
  checks: string[];
  editable: boolean;
  pending: boolean;
  onToggle: (items: { item: string; done: boolean }[]) => void;
}) {
  const crunch = daysLeft >= 0 && daysLeft <= 2;
  const [open, setOpen] = useState(crunch);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || data) return;
    let live = true;
    getSubmitCheck(code, n).then(
      (d) => live && setData(d),
      (e) => live && setErr(e instanceof Error ? e.message : "לא נטען"),
    );
    return () => {
      live = false;
    };
  }, [open, data, code, n]);

  const items = data?.questions.flatMap((q) => q.items) ?? [];
  const ticked = new Set(checks.filter((c) => c.startsWith(PART_PREFIX)).map((c) => c.slice(PART_PREFIX.length)));
  const doneParts = items.filter((i) => ticked.has(i.key)).length;
  const listDone = CHECKLIST.filter((c) => checks.includes(c.id)).length;
  const due = daysLeft < 0 ? "המועד עבר" : daysLeft === 0 ? "ההגשה היום" : daysLeft === 1 ? "ההגשה מחר" : `עוד ${daysLeft} ימים`;

  const togglePart = (key: string) => {
    const done = !ticked.has(key);
    const all = items.every((i) => (i.key === key ? done : ticked.has(i.key)));
    const changes = [{ item: PART_PREFIX + key, done }];
    // "every part answered" on the checklist follows the parts
    if (all !== checks.includes("parts")) changes.push({ item: "parts", done: all });
    onToggle(changes);
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-rule px-3 py-2 text-sm hover:bg-bg"
      >
        <span className="font-medium">מוכן להגשה?</span>
        <span className="flex items-center gap-2 text-xs text-ink-soft tabular-nums">
          {items.length > 0 && <span>{doneParts}/{items.length} סעיפים</span>}
          <span>{due}</span>
          <Icon name="chevronDown" className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-4 rounded-xl bg-bg p-3 text-sm">
          {err && <p className="hl">{err}</p>}
          {!data && !err && <p className="text-ink-soft">קורא את דף המטלה…</p>}

          {data && (
            <>
              <section>
                <h4 className="font-medium">הסעיפים בדף המטלה</h4>
                {data.sheet === "ok" ? (
                  <>
                    <ul className="mt-2 space-y-2">
                      {data.questions.map((q) => (
                        <li key={q.q} className="flex flex-wrap items-center gap-1.5">
                          <span className="w-24 shrink-0 text-ink-soft">
                            שאלה {q.q}
                            {q.points != null && <span className="text-xs"> · {q.points} נק׳</span>}
                          </span>
                          {q.items.map((it) => {
                            const on = ticked.has(it.key);
                            return (
                              <button
                                key={it.key}
                                type="button"
                                disabled={!editable || pending}
                                onClick={() => togglePart(it.key)}
                                aria-pressed={on}
                                aria-label={`${it.label.startsWith("שאלה") ? it.label : `שאלה ${q.q} סעיף ${it.label}`}: ${on ? "יש תשובה" : "עוד אין תשובה"}`}
                                className={`inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg border px-2 ${on ? "border-transparent text-bg" : "border-rule bg-surface text-ink"}`}
                                style={on ? { background: color } : undefined}
                              >
                                {on && <Icon name="check" className="size-3.5" />}
                                {it.label.startsWith("שאלה") ? "כל השאלה" : it.label}
                              </button>
                            );
                          })}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-ink-soft">
                      {doneParts === items.length ? "כל הסעיפים סומנו." : `נשארו ${items.length - doneParts} סעיפים בלי סימון.`} מסמנים כל סעיף שכתבתם לו תשובה. Unihub לא קורא את הפתרון ולא בודק אותו.
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-ink-soft">
                    {data.sheet === "none" ? "דף המטלה עוד לא הועלה, אז אין ממנו רשימת סעיפים." : "דף המטלה סרוק (בלי טקסט), אז אין ממנו רשימת סעיפים. סמנו את סעיף הבדיקה למטה ידנית."}
                  </p>
                )}
              </section>

              <section>
                <h4 className="font-medium">הפתרון</h4>
                <ul className="mt-2 space-y-1.5">
                  <Line ok={!!data.note}>
                    {data.note ? (
                      <>
                        {data.note.url ? (
                          <a href={data.note.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                            {data.note.name}
                          </a>
                        ) : (
                          data.note.name
                        )}{" "}
                        ב־Notability{data.note.modified && <span className="text-ink-soft"> · עודכן {when(data.note.modified)}</span>}
                      </>
                    ) : (
                      "לא מצאתי את הפתרון בפתקים מ־Notability. שמרו אותו בתיקיית הקורס, עם מספר המטלה בשם."
                    )}
                  </Line>
                  {data.note?.ocr && <Line ok={data.note.hasId}>{data.note.hasId ? "מספר זהות מופיע בראש הפתרון" : "לא מצאתי מספר זהות בראש הפתרון. כדאי לבדוק שהוא שם."}</Line>}
                  <Line ok={!!data.answer} neutral={!data.answer}>
                    {data.answer ? "הקובץ שהגשתי שמור ב־Unihub" : "אחרי ההגשה: ״העלאת הקובץ שהגשתי״ בשורת המטלה, כדי שיישמר כאן"}
                  </Line>
                </ul>
                {data.note && <p className="mt-2 text-xs text-ink-soft">הגרסה מ־Notability מגיעה ל־Unihub עד שעה אחרי השמירה.</p>}
              </section>
            </>
          )}

          <section>
            <h4 className="font-medium">
              לפני ששולחים <span className="text-xs font-normal text-ink-soft tabular-nums">· {listDone}/{CHECKLIST.length}</span>
            </h4>
            <ul className="mt-2 space-y-1.5">
              {CHECKLIST.map((c) => {
                const on = checks.includes(c.id);
                const auto = c.id === "parts" && items.length > 0;
                return (
                  <li key={c.id}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-4"
                        style={{ accentColor: color }}
                        checked={on}
                        disabled={!editable || pending || auto}
                        onChange={() => onToggle([{ item: c.id, done: !on }])}
                      />
                      <span className={on ? "text-ink-soft line-through" : ""}>{c.text}</span>
                      {auto && <span className="text-xs text-ink-soft">(לפי הסעיפים)</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-ink-soft">כשמגיע מייל אישור הגשה מהאוניברסיטה, המטלה מסומנת כהוגשה מעצמה.</p>
          </section>
        </div>
      )}
    </div>
  );
}

function Line({ ok, neutral, children }: { ok: boolean; neutral?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Icon name={ok ? "check" : neutral ? "dot" : "alert"} className={`mt-0.5 size-4 shrink-0 ${ok ? "" : neutral ? "text-ink-soft" : "hl"}`} />
      <span>{children}</span>
    </li>
  );
}
