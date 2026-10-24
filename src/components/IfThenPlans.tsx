"use client";

import { useState, useTransition } from "react";
import { deleteIfThen, saveIfThen, setIfThenActive } from "@/app/act";
import { Icon } from "@/components/Icon";
import { describeTrigger, focusMinutesOf, IF_THEN_TEMPLATES, type IfThenParams, type TriggerKind } from "@/lib/ifthen";

export interface IfThenRow {
  id: string;
  kind: TriggerKind;
  params: IfThenParams;
  action: string;
  active: boolean;
}

const KINDS: { kind: TriggerKind; label: string }[] = [
  { kind: "session_not_started", label: "מפגש לא התחיל" },
  { kind: "missed_day", label: "יום בלי לימוד" },
  { kind: "routine_missed", label: "שגרה שפוספסה" },
  { kind: "behind_goal", label: "מאחור ביעד השבועי" },
];
const DAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const field = "rounded-lg border border-rule bg-bg px-3 py-2";
const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-sm ${on ? "border-ink bg-ink text-bg" : "border-rule hover:border-ink-soft"}`;

/** Write 2–3 if-then plans; the push tick quotes them when their trigger fires. */
export function IfThenPlans({ plans, routines, editable }: { plans: IfThenRow[]; routines: { id: string; title: string }[]; editable: boolean }) {
  const [kind, setKind] = useState<TriggerKind>("session_not_started");
  const [params, setParams] = useState<IfThenParams>({ after: 15 });
  const [action, setAction] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const routineTitle = (id?: string) => routines.find((r) => r.id === id)?.title;

  const pick = (t: (typeof IF_THEN_TEMPLATES)[number]) => {
    setKind(t.kind);
    setParams(t.kind === "routine_missed" ? { routine_id: routines[0]?.id } : t.params);
    setAction(t.action);
  };
  const run = (fn: () => Promise<unknown>, ok?: string) =>
    start(async () => {
      try {
        await fn();
        setMsg(ok ?? null);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "לא נשמר");
      }
    });

  return (
    <div className="space-y-6">
      {plans.length > 0 ? (
        <ul className="panel divide-y divide-rule overflow-hidden">
          {plans.map((p) => (
            <li key={p.id} className={`flex items-start gap-3 px-4 py-3 ${p.active ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink-soft">{describeTrigger(p.kind, p.params, routineTitle(p.params.routine_id))}</div>
                <div className="font-medium">← {p.action}</div>
                <div className="mt-0.5 text-xs text-ink-soft">בהתראה: כפתור לטיימר של {focusMinutesOf(p.action)} דק׳</div>
              </div>
              {editable && (
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" disabled={pending} onClick={() => run(() => setIfThenActive(p.id, !p.active))} className="rounded-lg border border-rule px-2.5 py-1.5 text-xs hover:border-ink-soft">
                    {p.active ? "השהיה" : "הפעלה"}
                  </button>
                  <button type="button" disabled={pending} aria-label="מחיקה" onClick={() => run(() => deleteIfThen(p.id))} className="grid size-8 place-items-center rounded-lg text-ink-soft hover:text-ink">
                    <Icon name="close" className="size-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-soft">עוד אין תוכניות. מספיקות שתיים או שלוש, למצבים שבאמת קורים לך.</p>
      )}

      {editable && (
        <form
          className="panel space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await saveIfThen({ kind, params: params as Record<string, unknown>, action });
              setAction("");
            }, "נשמר");
          }}
        >
          <div>
            <h2 className="section-title">תוכנית חדשה</h2>
            <p className="mt-1 text-sm text-ink-soft">אפשר להתחיל מדוגמה:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {IF_THEN_TEMPLATES.map((t) => (
                <button key={t.kind} type="button" onClick={() => pick(t)} className="rounded-xl border border-dashed border-rule px-3 py-2 text-start text-sm hover:border-ink-soft">
                  <span className="block text-ink-soft">{describeTrigger(t.kind, t.params, t.kind === "routine_missed" ? routines[0]?.title : undefined)}</span>
                  <span className="block">← {t.action}</span>
                </button>
              ))}
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">אם…</legend>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  onClick={() => {
                    setKind(k.kind);
                    setParams(IF_THEN_TEMPLATES.find((t) => t.kind === k.kind)!.params);
                    if (k.kind === "routine_missed") setParams({ routine_id: routines[0]?.id });
                  }}
                  className={chip(kind === k.kind)}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              {kind === "session_not_started" && (
                <label className="flex items-center gap-2">
                  לא התחלתי
                  <input type="number" min={5} max={120} step={5} value={params.after ?? 15} onChange={(e) => setParams({ after: Number(e.target.value) })} className={`${field} w-20`} />
                  דקות אחרי תחילת מפגש
                </label>
              )}
              {kind === "missed_day" && (
                <>
                  <label className="flex items-center gap-2">
                    עד השעה
                    <input type="time" value={params.by ?? "18:00"} onChange={(e) => setParams({ ...params, by: e.target.value })} className={field} dir="ltr" />
                    לא נרשם לימוד, בימים:
                  </label>
                  <Days value={params.days ?? [0, 1, 2, 3, 4]} onChange={(days) => setParams({ ...params, days })} />
                </>
              )}
              {kind === "routine_missed" && (
                <label className="flex items-center gap-2">
                  לא סימנתי את
                  <select value={params.routine_id ?? ""} onChange={(e) => setParams({ routine_id: e.target.value })} className={field}>
                    {routines.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                  עד סוף הזמן שלה
                </label>
              )}
              {kind === "behind_goal" && (
                <>
                  <label className="flex items-center gap-2">
                    חסרות יותר מ־
                    <input type="number" min={0.5} max={40} step={0.5} value={(params.gap ?? 120) / 60} onChange={(e) => setParams({ ...params, gap: Math.round(Number(e.target.value) * 60) })} className={`${field} w-20`} />
                    שעות ליעד, בבדיקה בשעה
                    <input type="time" value={params.at ?? "20:00"} onChange={(e) => setParams({ ...params, at: e.target.value })} className={field} dir="ltr" />
                  </label>
                  <Days value={params.days ?? [3]} onChange={(days) => setParams({ ...params, days })} />
                </>
              )}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">אז אני…</span>
            <input value={action} onChange={(e) => setAction(e.target.value)} maxLength={200} placeholder="15 דקות כרטיסיות" className={`${field} w-full`} />
            <span className="mt-1 block text-xs text-ink-soft">פעולה קטנה ומוחשית. אם כתוב בה מספר דקות, ההתראה תפתח טיימר באורך הזה (אחרת: שתי דקות).</span>
          </label>

          <div className="flex items-center gap-3">
            <button disabled={pending || !action.trim() || (kind === "routine_missed" && !params.routine_id)} className="rounded-lg bg-ink px-5 py-2.5 font-medium text-bg disabled:opacity-50">
              שמירה
            </button>
            <span role="status" className="text-sm text-ink-soft">
              {msg}
            </span>
          </div>
        </form>
      )}
    </div>
  );
}

function Days({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <span className="flex gap-1" role="group" aria-label="ימים">
      {DAYS.map((d, i) => {
        const on = value.includes(i);
        return (
          <button key={d} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== i) : [...value, i].sort())} className={`grid size-8 place-items-center rounded-full border text-xs ${on ? "border-ink bg-ink text-bg" : "border-rule"}`}>
            {d}
          </button>
        );
      })}
    </span>
  );
}
