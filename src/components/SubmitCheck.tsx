"use client";

import { useEffect, useState } from "react";
import { getSubmitCheck } from "@/app/act";
import type { SubmitCheck as Data } from "@/lib/submitState";
import { Icon } from "@/components/Icon";
import { CHECKLIST } from "@/lib/tracker";
import { PART_NO_PREFIX, PART_PREFIX } from "@/lib/sheetStructure";
import type { PacePoint } from "@/lib/pace";
import { PaceChart } from "@/components/PaceChart";

const when = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export type Change = { item: string; done: boolean };

/**
 * Which parts have answers, from my marks (they win) and the detection, and what a tap on a part
 * should store. Shared by the assignment card and the ready-to-submit panel.
 */
export function partsState(data: Data | null, checks: string[]) {
  const items = data?.questions.flatMap((q) => q.items) ?? [];
  const marked = (prefix: string) => new Set(checks.filter((c) => c.startsWith(prefix)).map((c) => c.slice(prefix.length)));
  const yes = marked(PART_PREFIX);
  const no = marked(PART_NO_PREFIX);
  const found = new Set(data?.detected ?? []);
  const emptyHeading = new Set(data?.emptyParts ?? []);
  const answered = (k: string) => yes.has(k) || (found.has(k) && !no.has(k));
  const auto = (k: string) => !yes.has(k) && found.has(k) && !no.has(k);
  const blank = (k: string) => !answered(k) && emptyHeading.has(k);
  const doneParts = items.filter((i) => answered(i.key)).length;
  const toggle = (key: string): Change[] => {
    const done = !answered(key);
    const all = items.every((i) => (i.key === key ? done : answered(i.key)));
    const changes: Change[] = [];
    if (done) {
      if (no.has(key)) changes.push({ item: PART_NO_PREFIX + key, done: false });
      if (!found.has(key)) changes.push({ item: PART_PREFIX + key, done: true });
    } else {
      if (yes.has(key)) changes.push({ item: PART_PREFIX + key, done: false });
      if (found.has(key)) changes.push({ item: PART_NO_PREFIX + key, done: true });
    }
    // "every part answered" on the checklist follows the parts
    if (all !== checks.includes("parts")) changes.push({ item: "parts", done: all });
    return changes;
  };
  return { items, answered, auto, blank, doneParts, toggle };
}
export type Parts = ReturnType<typeof partsState>;

/** Every part of the sheet, grouped by question: tap to mark it answered (✦ = found in the solution). */
export function PartsGrid({
  data,
  parts,
  color,
  editable,
  pending,
  onToggle,
  questionLabel,
}: {
  data: Data;
  parts: Parts;
  color: string;
  editable: boolean;
  pending: boolean;
  onToggle: (changes: Change[]) => void;
  /** the question's own label, e.g. a button for its status (in progress / stuck) */
  questionLabel?: (q: number, points: number | null) => React.ReactNode;
}) {
  return (
    <ul className="space-y-2">
      {data.questions.map((q) => (
        <li key={q.q} className="flex flex-wrap items-center gap-1.5">
          <span className="w-24 shrink-0 text-sm text-ink-soft">
            {questionLabel ? (
              questionLabel(q.q, q.points)
            ) : (
              <>
                שאלה {q.q}
                {q.points != null && <span className="text-xs"> · {q.points} נק׳</span>}
              </>
            )}
          </span>
          {q.items.map((it) => {
            const on = parts.answered(it.key);
            const byAuto = parts.auto(it.key);
            const blank = parts.blank(it.key);
            const whole = it.label.startsWith("שאלה");
            return (
              <button
                key={it.key}
                type="button"
                disabled={!editable || pending}
                onClick={() => onToggle(parts.toggle(it.key))}
                aria-pressed={on}
                aria-label={`${whole ? it.label : `שאלה ${q.q} סעיף ${it.label}`}: ${on ? (byAuto ? "זוהתה תשובה בפתרון" : "יש תשובה") : blank ? "יש כותרת בלי תשובה" : "עוד אין תשובה"}`}
                title={byAuto ? "זוהה בפתרון. לחיצה מסמנת שאין תשובה." : blank ? "הכותרת בפתרון, אבל מתחתיה ריק" : undefined}
                className={`inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border px-2 text-sm ${on ? "border-transparent text-bg" : blank ? "border-dashed border-ink bg-surface text-ink" : "border-rule-strong bg-surface text-ink hover:border-ink"}`}
                style={on ? { background: color } : undefined}
              >
                {on && <Icon name={byAuto ? "sparkle" : "check"} className="size-3.5" />}
                {whole ? "כל השאלה" : it.label}
              </button>
            );
          })}
        </li>
      ))}
    </ul>
  );
}

/** The lines under the parts: what's left, where the ✦ came from, and the detection's state. */
export function PartsNotes({ data, parts }: { data: Data; parts: Parts }) {
  const left = parts.items.length - parts.doneParts;
  return (
    <div className="space-y-1 text-xs text-ink-soft">
      <p>
        {left === 0 ? "לכל הסעיפים יש תשובה." : `נשארו ${left === 1 ? "סעיף אחד" : `${left} סעיפים`} בלי תשובה.`}{" "}
        {data.note?.detect === "ok" && parts.items.some((i) => parts.auto(i.key))
          ? "✦ זוהה לפי הכותרות בפתרון; לחיצה מתקנת. הזיהוי מחפש כותרות בלבד ולא בודק תשובות."
          : "מסמנים כל סעיף שכתבתם לו תשובה. Unihub לא בודק את התשובות."}
      </p>
      {parts.items.some((i) => parts.blank(i.key)) && <p className="text-ink">יש בפתרון כותרת בלי שום דבר מתחתיה (מסגרת מקווקוות).</p>}
      {data.note?.detect === "stale" && <p>יש גרסה חדשה של הפתרון. הסעיפים יזוהו מחדש עד שעה אחרי שהיא מגיעה ל־Unihub.</p>}
      {data.note?.detect === "error" && <p className="hl">הזיהוי האוטומטי נכשל בגרסה האחרונה: {data.note.detectError}</p>}
      {data.note?.detect === "off" && <p>אפשר שהסעיפים יסומנו מעצמם לפי הכותרות בפתרון: מפתח Gemini חינמי בסקריפט של Google (ההוראות בהגדרות).</p>}
    </div>
  );
}

/** The sheet has no parts to list: why. */
export function NoParts({ data }: { data: Data }) {
  return (
    <p className="text-sm text-ink-soft">
      {data.sheet === "none" ? "דף המטלה עוד לא הועלה, אז אין ממנו רשימת סעיפים." : "דף המטלה סרוק (בלי טקסט), אז אין ממנו רשימת סעיפים."}
    </p>
  );
}

/** What can be checked about my Notability solution without reading it. */
export function SolutionChecks({ data }: { data: Data }) {
  return (
    <div>
      <ul className="space-y-1.5 text-sm">
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
          {data.answer ? "הקובץ שהגשתי שמור ב־Unihub" : "אחרי ההגשה: מעלים את הקובץ שהגשתי, כדי שיישמר כאן"}
        </Line>
      </ul>
      {data.note && <p className="mt-2 text-xs text-ink-soft">הגרסה מ־Notability מגיעה ל־Unihub עד שעה אחרי השמירה.</p>}
    </div>
  );
}

/** The submission checklist; "every part answered" follows the parts when the sheet has them. */
export function SubmitChecklist({
  checks,
  color,
  editable,
  pending,
  partsAuto,
  onToggle,
}: {
  checks: string[];
  color: string;
  editable: boolean;
  pending: boolean;
  partsAuto: boolean;
  onToggle: (changes: Change[]) => void;
}) {
  return (
    <div>
      <ul className="space-y-1.5 text-sm">
        {CHECKLIST.map((c) => {
          const on = checks.includes(c.id);
          const auto = c.id === "parts" && partsAuto;
          return (
            <li key={c.id}>
              <label className="flex min-h-9 items-center gap-2">
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
    </div>
  );
}

/**
 * "Ready to submit" as a panel that loads its own data (used where the page didn't load it):
 * every part, the pace, the solution, and the checklist.
 */
export function SubmitCheck({
  code,
  n,
  color,
  daysLeft,
  due: dueDate,
  pace,
  window: win,
  checks,
  editable,
  pending,
  onToggle,
}: {
  code: string;
  n: string;
  color: string;
  daysLeft: number;
  due?: string;
  pace?: PacePoint[];
  window?: { start: string; target: string } | null;
  checks: string[];
  editable: boolean;
  pending: boolean;
  onToggle: (items: Change[]) => void;
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

  const parts = partsState(data, checks);
  const due = daysLeft < 0 ? "המועד עבר" : daysLeft === 0 ? "ההגשה היום" : daysLeft === 1 ? "ההגשה מחר" : `עוד ${daysLeft} ימים`;

  return (
    <div className="mt-3">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 rounded-lg border border-rule px-3 py-2 text-sm hover:bg-bg">
        <span className="font-medium">מוכן להגשה?</span>
        <span className="flex items-center gap-2 text-xs text-ink-soft tabular-nums">
          {parts.items.length > 0 && (
            <span>
              {parts.doneParts}/{parts.items.length} סעיפים
            </span>
          )}
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
              <section className="space-y-2">
                <h4 className="font-medium">הסעיפים בדף המטלה</h4>
                {data.sheet === "ok" ? (
                  <>
                    <PartsGrid data={data} parts={parts} color={color} editable={editable} pending={pending} onToggle={onToggle} />
                    <PartsNotes data={data} parts={parts} />
                  </>
                ) : (
                  <NoParts data={data} />
                )}
              </section>
              {parts.items.length > 0 && win && dueDate && (
                <section>
                  <h4 className="font-medium">הקצב</h4>
                  <div className="mt-1">
                    <PaceChart points={pace ?? []} answered={parts.doneParts} total={parts.items.length} window={win} due={dueDate} color={color} />
                  </div>
                </section>
              )}
              <section className="space-y-2">
                <h4 className="font-medium">הפתרון</h4>
                <SolutionChecks data={data} />
              </section>
            </>
          )}
          <section className="space-y-2">
            <h4 className="font-medium">לפני ששולחים</h4>
            <SubmitChecklist checks={checks} color={color} editable={editable} pending={pending} partsAuto={parts.items.length > 0} onToggle={onToggle} />
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
