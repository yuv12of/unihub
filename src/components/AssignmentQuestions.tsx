"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setQuestionCount, setQuestionState, toggleCheck } from "@/app/act";
import { Icon } from "@/components/Icon";
import { CHECKLIST, Q_LABEL, type QStatus } from "@/lib/tracker";

export interface TrackedAssignment {
  n: string;
  label: string; // ממ״ן 01
  dueLabel: string; // 12.11
  daysLeft: number;
  questions: { q: number; status: QStatus }[];
  checks: string[];
}

const STYLE: Record<QStatus, string> = {
  todo: "border-rule text-ink-soft",
  doing: "border-ink text-ink",
  done: "border-transparent text-bg",
  stuck: "border-ink text-ink hl",
};

/** Open ממ"נים: where I am question by question, and the checklist for the last 48 hours. */
export function AssignmentQuestions({ code, color, items, editable }: { code: string; color: string; items: TrackedAssignment[]; editable: boolean }) {
  if (!items.length) return <p className="mt-2 text-sm text-ink-soft">אין ממ״ן פתוח כרגע.</p>;
  return (
    <ul className="mt-3 divide-y divide-rule border-t border-rule">
      {items.map((it) => (
        <Row key={it.n} code={code} color={color} it={it} editable={editable} />
      ))}
    </ul>
  );
}

function Row({ code, color, it, editable }: { code: string; color: string; it: TrackedAssignment; editable: boolean }) {
  const [qs, applyQ] = useOptimistic(it.questions, (s, p: { q: number; status: QStatus }) => s.map((x) => (x.q === p.q ? { ...x, status: p.status } : x)));
  const [checks, applyC] = useOptimistic(it.checks, (s, p: { item: string; done: boolean }) => (p.done ? [...s, p.item] : s.filter((x) => x !== p.item)));
  const [sel, setSel] = useState<number | null>(null);
  const [count, setCount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setErr(null);
      try {
        await fn();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "לא נשמר");
      }
    });
  const done = qs.filter((x) => x.status === "done").length;
  const stuck = qs.filter((x) => x.status === "stuck").length;
  const crunch = it.daysLeft >= 0 && it.daysLeft <= 2;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {it.label} <span className="text-sm font-normal text-ink-soft">· עד {it.dueLabel}</span>
        </span>
        {qs.length > 0 && (
          <span className="text-xs text-ink-soft tabular-nums">
            {done}/{qs.length} שאלות{stuck ? ` · ${stuck} תקועות` : ""}
          </span>
        )}
      </div>

      {qs.length ? (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`שאלות ב${it.label}`}>
            {qs.map((x) => (
              <button
                key={x.q}
                type="button"
                onClick={() => setSel(sel === x.q ? null : x.q)}
                aria-pressed={sel === x.q}
                aria-label={`שאלה ${x.q}: ${Q_LABEL[x.status]}`}
                className={`grid h-9 min-w-9 place-items-center rounded-lg border px-2 text-sm tabular-nums ${STYLE[x.status]} ${sel === x.q ? "ring-2 ring-ink ring-offset-1 ring-offset-surface" : ""}`}
                style={x.status === "done" ? { background: color } : undefined}
              >
                {x.status === "done" ? <Icon name="check" className="size-4" /> : x.q}
              </button>
            ))}
          </div>
          {sel != null && editable && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-ink-soft">שאלה {sel}:</span>
              {(["todo", "doing", "done", "stuck"] as QStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={pending}
                  aria-pressed={qs.find((x) => x.q === sel)?.status === s}
                  onClick={() => {
                    const q = sel;
                    setSel(null);
                    run(async () => {
                      applyQ({ q, status: s });
                      await setQuestionState({ code, n: it.n, q, status: s });
                    });
                  }}
                  className="rounded-full border border-rule px-3 py-1 aria-pressed:bg-ink aria-pressed:text-bg"
                >
                  {Q_LABEL[s]}
                </button>
              ))}
            </div>
          )}
          {sel != null && qs.find((x) => x.q === sel)?.status !== "stuck" && editable && <p className="mt-1 text-xs text-ink-soft">״תקוע״ פותח גם נקודה לתרגול ולשאלה במפגש.</p>}
        </>
      ) : (
        editable && (
          <form
            className="mt-2 flex items-center gap-2 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              const c = Number(count);
              if (c > 0) run(() => setQuestionCount({ code, n: it.n, count: c }));
            }}
          >
            <span className="text-ink-soft">כמה שאלות יש בממ״ן?</span>
            <input value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" className="w-14 rounded-lg border border-rule bg-surface px-2 py-1 text-center" aria-label="מספר שאלות" />
            <button disabled={pending || !count} className="rounded-lg bg-ink px-3 py-1 text-bg disabled:opacity-50">
              הוספה
            </button>
          </form>
        )
      )}

      {crunch && (
        <div className="mt-3 rounded-xl bg-bg p-3 text-sm">
          <p className="font-medium">
            לפני ההגשה ({it.daysLeft === 0 ? "היום" : it.daysLeft === 1 ? "מחר" : "מחרתיים"}) · {checks.length}/{CHECKLIST.length}
          </p>
          <ul className="mt-2 space-y-1.5">
            {CHECKLIST.map((c) => {
              const on = checks.includes(c.id);
              return (
                <li key={c.id}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4"
                      style={{ accentColor: color }}
                      checked={on}
                      disabled={!editable}
                      onChange={() =>
                        run(async () => {
                          applyC({ item: c.id, done: !on });
                          await toggleCheck({ code, n: it.n, item: c.id, done: !on });
                        })
                      }
                    />
                    <span className={on ? "text-ink-soft line-through" : ""}>{c.text}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-ink-soft">כשמגיע מייל אישור הגשה מהאוניברסיטה, המטלה מסומנת כהוגשה מעצמה.</p>
        </div>
      )}
      {err && <p className="mt-1 text-xs hl">{err}</p>}
    </li>
  );
}
