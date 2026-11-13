"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { addMilestone, addTask, createGoal, deleteGoal, deleteMilestone, deleteTask, logGoal, setMilestoneDone, setTaskDone, updateGoal } from "@/app/act";
import { Icon } from "@/components/Icon";
import { ProgressRing, Spark } from "@/components/GoalViz";
import { AREAS, BOARD, COLORS, MODES, STATUSES, TEMPLATES, colorVar, type GoalArea, type GoalColor, type GoalStatus, type Milestone, type ProgressMode, type Task } from "@/lib/goalMeta";

const field = "w-full rounded-lg border border-rule-strong bg-surface px-3 py-2";

function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        after?.();
      } catch (e) {
        setError((e as Error).message || "השמירה נכשלה");
      }
    });
  return { pending, error, run };
}

function Err({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-2 text-sm">
      <span className="hl">{error}</span>
    </p>
  ) : null;
}

/* ---------- The board ---------- */

export interface GoalCard {
  id: string;
  title: string;
  color: string;
  status: GoalStatus;
  area: string;
  p: number;
  line: string;
  due: string | null;
  spark: number[];
  next: string | null;
  stalled: number;
}

function Card({ g }: { g: GoalCard }) {
  const { pending, error, run } = useRun();
  const color = colorVar(g.color);
  return (
    <li className="panel p-4">
      <Link href={`/goals/${g.id}`} className="flex items-center gap-3">
        <ProgressRing p={g.p} color={color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold hover:underline">{g.title}</span>
          <span className="block text-xs text-ink-soft">{[g.area, g.line, g.due].filter(Boolean).join(" · ")}</span>
        </span>
        {g.stalled ? <span className="shrink-0 rounded-md bg-highlight px-2 py-0.5 text-xs font-semibold text-highlight-ink">תקוע {g.stalled} ימים</span> : g.status === "active" && <Spark points={g.spark} color={color} />}
      </Link>
      {g.status === "active" && (g.next || g.stalled > 0) && (
        <div className="mt-3 flex min-h-11 items-center gap-2 border-t border-rule pt-2 text-sm">
          {g.next ? (
            <p className="min-w-0 flex-1 truncate">
              <span className="text-xs text-ink-soft">הצעד הבא </span>
              {g.next}
            </p>
          ) : (
            <p className="flex-1">מה הצעד הכי קטן?</p>
          )}
          {g.stalled > 0 && (
            <button type="button" disabled={pending} onClick={() => run(() => updateGoal(g.id, { status: "paused" }))} className="btn shrink-0">
              להשהות
            </button>
          )}
        </div>
      )}
      {g.status !== "active" && g.status !== "done" && (
        <div className="mt-3 border-t border-rule pt-2">
          <button type="button" disabled={pending} onClick={() => run(() => updateGoal(g.id, { status: "active" }))} className="btn-ghost -ms-3">
            {g.status === "idea" ? "להתחיל" : "להמשיך"}
          </button>
        </div>
      )}
      <Err error={error} />
    </li>
  );
}

/** Phone: one status at a time behind tabs. Wide screens: the four columns side by side. */
export function GoalBoard({ cards }: { cards: GoalCard[] }) {
  const [tab, setTab] = useState<GoalStatus>("active");
  const pick = setTab;
  const of = (s: GoalStatus) => cards.filter((c) => c.status === s);
  const empty: Record<string, string> = { active: "אין מטרות בתהליך. מתחילים אחת?", idea: "רעיונות למטרות שעוד לא התחילו יחכו כאן.", paused: "מטרה שהושהתה לא נעלמת, היא מחכה כאן.", done: "מטרות שהושלמו יופיעו כאן." };
  return (
    <div>
      <div role="tablist" aria-label="סטטוס" className="grid grid-cols-4 gap-1.5 xl:hidden">
        {BOARD.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={tab === s} onClick={() => pick(s)} className={`min-h-11 rounded-lg border px-1 text-sm ${tab === s ? "accent-surface border-transparent font-medium" : "border-rule-strong bg-surface"}`}>
            {STATUSES[s]} {of(s).length}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-5 xl:mt-0 xl:grid-cols-4">
        {BOARD.map((s) => (
          <section key={s} aria-label={STATUSES[s]} className={tab === s ? "" : "hidden xl:block"}>
            <h2 className="mb-2 hidden items-baseline justify-between text-sm font-semibold xl:flex">
              {STATUSES[s]}
              <span className="font-normal text-ink-soft">{of(s).length}</span>
            </h2>
            {of(s).length ? (
              <ul className="space-y-3">
                {of(s).map((g) => (
                  <Card key={g.id} g={g} />
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-rule-strong px-4 py-6 text-center text-sm text-ink-soft">{empty[s]}</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

/* ---------- New goal ---------- */

export function GoalNew({ startOpen = false }: { startOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<GoalArea>("personal");
  const [color, setColor] = useState<GoalColor>("blue");
  const [mode, setMode] = useState<ProgressMode>("tasks");
  const [start, setStart] = useState("0");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [due, setDue] = useState("");
  const [steps, setSteps] = useState("");
  const [why, setWhy] = useState("");
  const [idea, setIdea] = useState(false);
  const { pending, error, run } = useRun();

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary min-h-11 px-5">
        <Icon name="plus" className="size-4" />
        מטרה חדשה
      </button>
    );
  const fillFrom = (t: (typeof TEMPLATES)[number]) => {
    setTitle(t.title);
    setArea(t.area);
    setColor(t.color);
    setMode(t.mode);
    setStart(String(t.start ?? 0));
    setTarget(t.target != null ? String(t.target) : "");
    setUnit(t.unit ?? "");
    setSteps(t.steps.join("\n"));
  };
  return (
    <form
      className="panel max-w-xl space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const id = await createGoal({ title, area, color, mode, start: Number(start), target: target === "" ? null : Number(target), unit, due: due || null, why, status: idea ? "idea" : "active", steps: steps.split("\n") });
          router.push(`/goals/${id}`);
        });
      }}
    >
      <div>
        <p className="text-sm text-ink-soft">אפשר להתחיל מתבנית</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button key={t.title} type="button" onClick={() => fillFrom(t)} className="chip" aria-pressed={title === t.title}>
              {t.title}
            </button>
          ))}
        </div>
      </div>
      <label className="block text-sm">
        <span className="text-ink-soft">שם המטרה</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} placeholder="למשל: אתר תיק עבודות" className={`${field} mt-1 text-lg`} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-ink-soft">תחום</span>
          <select value={area} onChange={(e) => setArea(e.target.value as GoalArea)} className={`${field} mt-1`}>
            {Object.entries(AREAS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-soft">תאריך יעד (לא חובה)</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${field} mt-1`} />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm text-ink-soft">צבע</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={c} aria-pressed={color === c} onClick={() => setColor(c)} className={`size-9 rounded-full border-2 ${color === c ? "border-ink" : "border-transparent"}`}>
              <span className="mx-auto block size-6 rounded-full" style={{ background: colorVar(c) }} />
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm text-ink-soft">איך מודדים התקדמות?</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {(Object.keys(MODES) as ProgressMode[]).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`rounded-lg border px-3 py-2 text-start ${mode === m ? "accent-surface border-transparent" : "border-rule-strong"}`}>
              <span className="block text-sm font-medium">{MODES[m].label}</span>
              <span className={`block text-xs ${mode === m ? "" : "text-ink-soft"}`}>{MODES[m].desc}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {mode === "number" && (
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm">
            <span className="text-ink-soft">מתחילים ב־</span>
            <input type="number" step="any" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="block text-sm">
            <span className="text-ink-soft">היעד</span>
            <input type="number" step="any" inputMode="decimal" required value={target} onChange={(e) => setTarget(e.target.value)} className={`${field} mt-1`} />
          </label>
          <label className="block text-sm">
            <span className="text-ink-soft">יחידה</span>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={12} placeholder="₪ / ק״מ" className={`${field} mt-1`} />
          </label>
        </div>
      )}
      {(mode === "tasks" || mode === "milestones") && (
        <label className="block text-sm">
          <span className="text-ink-soft">{mode === "tasks" ? "משימות" : "אבני דרך"} להתחלה (שורה לכל אחת, לא חובה)</span>
          <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={4} className={`${field} mt-1`} />
        </label>
      )}
      <label className="block text-sm">
        <span className="text-ink-soft">למה זה חשוב לך? (לא חובה)</span>
        <input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} placeholder="תזכורת לימים שאין כוח" className={`${field} mt-1`} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={idea} onChange={(e) => setIdea(e.target.checked)} className="size-4" />
        רק רעיון בינתיים, עוד לא מתחילים
      </label>
      <Err error={error} />
      <div className="flex gap-2">
        <button disabled={pending} className="btn-primary min-h-11 px-5">
          יצירה
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost min-h-11">
          ביטול
        </button>
      </div>
    </form>
  );
}

/* ---------- Tasks and milestones ---------- */

type Row = { id: string; title: string; due: string | null; done: boolean };
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`;

function CheckList({ rows, today, onToggle, onDelete, onAdd, addLabel, emptyText }: { rows: Row[]; today: string; onToggle: (id: string, done: boolean) => Promise<unknown>; onDelete: (id: string) => Promise<unknown>; onAdd: (title: string, due: string | null) => Promise<unknown>; addLabel: string; emptyText: string }) {
  const [shown, setDone] = useOptimistic(rows, (cur, ch: { id: string; done: boolean }) => cur.map((r) => (r.id === ch.id ? { ...r, done: ch.done } : r)));
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const { pending, error, run } = useRun();
  const [, start] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);
  const toggle = (r: Row) =>
    start(async () => {
      setDone({ id: r.id, done: !r.done });
      setToggleError(null);
      try {
        await onToggle(r.id, !r.done);
      } catch (e) {
        setToggleError((e as Error).message || "השמירה נכשלה");
      }
    });
  return (
    <div>
      {shown.length === 0 && <p className="text-sm text-ink-soft">{emptyText}</p>}
      <ul>
        {shown.map((r) => (
          <li key={r.id} className="group flex min-h-11 items-center gap-3">
            <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
              <input type="checkbox" checked={r.done} onChange={() => toggle(r)} className="size-5 shrink-0 accent-[var(--ink)]" />
              <span className={r.done ? "text-ink-soft line-through" : ""}>{r.title}</span>
            </label>
            {r.due && !r.done && <span className={`shrink-0 text-xs ${r.due < today ? "font-semibold text-bad" : "text-ink-soft"}`}>{r.due === today ? "היום" : shortDate(r.due)}</span>}
            <button type="button" aria-label={`מחיקת ${r.title}`} onClick={() => run(() => onDelete(r.id))} className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-bg hover:text-ink">
              <Icon name="close" className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          run(
            () => onAdd(title, due || null),
            () => {
              setTitle("");
              setDue("");
            },
          );
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder={addLabel} aria-label={addLabel} className={`${field} min-w-40 flex-1`} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="תאריך (לא חובה)" className={`${field} w-auto`} />
        <button disabled={pending || !title.trim()} className="btn min-h-11">
          הוספה
        </button>
      </form>
      <Err error={error ?? toggleError} />
    </div>
  );
}

export function TaskList({ goalId, tasks, today }: { goalId: string | null; tasks: Task[]; today: string }) {
  // open tasks first (in their order), finished ones after
  const rows = [...tasks].sort((a, b) => Number(!!a.done_at) - Number(!!b.done_at) || a.sort - b.sort).map((t) => ({ id: t.id, title: t.title, due: t.due, done: !!t.done_at }));
  return <CheckList rows={rows} today={today} onToggle={setTaskDone} onDelete={deleteTask} onAdd={(t, d) => addTask(goalId, t, d)} addLabel="משימה חדשה" emptyText={goalId ? "עוד אין משימות. מה הצעד הראשון?" : "אין משימות פתוחות."} />;
}

export function MilestoneList({ goalId, milestones, today }: { goalId: string; milestones: Milestone[]; today: string }) {
  const rows = milestones.map((m) => ({ id: m.id, title: m.title, due: m.due, done: !!m.done_at }));
  return <CheckList rows={rows} today={today} onToggle={setMilestoneDone} onDelete={deleteMilestone} onAdd={(t, d) => addMilestone(goalId, t, d)} addLabel="אבן דרך חדשה" emptyText="אבני דרך הן השלבים הגדולים בדרך. לא חובה." />;
}

/* ---------- Updating a number or a percent ---------- */

export function GoalLogForm({ goalId, mode, current, unit }: { goalId: string; mode: "number" | "manual"; current: number; unit: string | null }) {
  const [v, setV] = useState(String(current));
  const { pending, error, run } = useRun();
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        run(
          () => logGoal(goalId, mode === "number" ? { value: Number(v) } : { percent: Number(v) }),
          () => setSaved(true),
        );
      }}
    >
      <label className="block text-sm">
        <span className="text-ink-soft">{mode === "number" ? `איפה זה עומד היום${unit ? ` (${unit})` : ""}?` : "כמה אחוזים הושלמו?"}</span>
        {mode === "number" ? (
          <input type="number" step="any" inputMode="decimal" required value={v} onChange={(e) => setV(e.target.value)} className={`${field} mt-1 w-36`} />
        ) : (
          <span className="mt-1 flex items-center gap-3">
            <input type="range" min={0} max={100} step={5} value={v} onChange={(e) => setV(e.target.value)} className="w-48" />
            <b>{v}%</b>
          </span>
        )}
      </label>
      <button disabled={pending} className="btn min-h-11">
        עדכון
      </button>
      {saved && !error && (
        <span role="status" className="self-center text-sm text-ok">
          נשמר
        </span>
      )}
      <Err error={error} />
    </form>
  );
}

/* ---------- Status, deadline, delete ---------- */

export function GoalSettings({ id, status, due, why }: { id: string; status: GoalStatus; due: string | null; why: string | null }) {
  const router = useRouter();
  const { pending, error, run } = useRun();
  const [confirm, setConfirm] = useState(false);
  const [d, setD] = useState(due ?? "");
  const [w, setW] = useState(why ?? "");
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-ink-soft">סטטוס</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {(Object.keys(STATUSES) as GoalStatus[]).map((s) => (
            <button key={s} type="button" disabled={pending} aria-pressed={status === s} onClick={() => run(() => updateGoal(id, { status: s }))} className="chip">
              {STATUSES[s]}
            </button>
          ))}
        </div>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateGoal(id, { due: d || null, why: w }));
        }}
      >
        <label className="block text-sm">
          <span className="text-ink-soft">תאריך יעד</span>
          <input type="date" value={d} onChange={(e) => setD(e.target.value)} className={`${field} mt-1 w-auto`} />
        </label>
        <label className="block min-w-48 flex-1 text-sm">
          <span className="text-ink-soft">למה זה חשוב לי</span>
          <input value={w} onChange={(e) => setW(e.target.value)} maxLength={300} className={`${field} mt-1`} />
        </label>
        <button disabled={pending} className="btn min-h-11">
          שמירה
        </button>
      </form>
      <div>
        {confirm ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            למחוק את המטרה עם כל המשימות וההיסטוריה שלה?
            <button type="button" disabled={pending} onClick={() => run(() => deleteGoal(id), () => router.push("/goals"))} className="btn text-bad">
              מחיקה
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="btn-ghost">
              ביטול
            </button>
          </p>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="btn-ghost -ms-3 text-bad">
            מחיקת המטרה
          </button>
        )}
      </div>
      <Err error={error} />
    </div>
  );
}

/* ---------- Today: the next step of each active goal ---------- */

export interface NextStepRow {
  goalId: string | null;
  goal: string | null;
  color: string;
  kind: "task" | "milestone";
  id: string;
  title: string;
  due: string | null;
}

export function NextSteps({ rows, today }: { rows: NextStepRow[]; today: string }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const { error, run } = useRun();
  const tick = (r: NextStepRow) => {
    setDone((s) => new Set(s).add(r.id));
    run(async () => {
      try {
        await (r.kind === "task" ? setTaskDone(r.id, true) : setMilestoneDone(r.id, true));
      } catch (e) {
        setDone((s) => {
          const n = new Set(s);
          n.delete(r.id);
          return n;
        });
        throw e;
      }
    });
  };
  return (
    <div>
      <ul className="divide-y divide-rule">
        {rows.map((r) => (
          <li key={r.id} className="flex min-h-12 items-center gap-3 py-1">
            <input type="checkbox" checked={done.has(r.id)} disabled={done.has(r.id)} onChange={() => tick(r)} aria-label={`סימון ״${r.title}״ כבוצע`} className="size-5 shrink-0 accent-[var(--ink)]" />
            <span className="min-w-0 flex-1">
              <span className={`block truncate ${done.has(r.id) ? "text-ink-soft line-through" : ""}`}>{r.title}</span>
              {r.goalId ? (
                <Link href={`/goals/${r.goalId}`} className="flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink">
                  <span className="size-2 rounded-full" style={{ background: colorVar(r.color) }} />
                  {r.goal}
                </Link>
              ) : (
                <span className="block text-xs text-ink-soft">משימה</span>
              )}
            </span>
            {r.due && <span className={`shrink-0 text-xs ${r.due < today ? "font-semibold text-bad" : "text-ink-soft"}`}>{r.due === today ? "היום" : r.due < today ? "באיחור" : shortDate(r.due)}</span>}
          </li>
        ))}
      </ul>
      <Err error={error} />
    </div>
  );
}
