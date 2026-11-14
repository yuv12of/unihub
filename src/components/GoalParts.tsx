"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { addGoalNote, addMilestone, addTask, createGoal, deleteGoalNote, setStepNote, deleteGoal, deleteMilestone, deleteTask, logGoal, logGoalTime, setGoalWeekly, setMilestoneDone, setTaskDone, updateGoal } from "@/app/act";
import { FocusTimer } from "@/components/SessionToggle";
import { duration } from "@/lib/time";
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
  /** the latest journal entry, if any */
  note: string | null;
}

function Card({ g, onDragStart }: { g: GoalCard; onDragStart?: (id: string) => void }) {
  const { pending, error, run } = useRun();
  const color = colorVar(g.color);
  return (
    <li
      className="panel p-4 xl:cursor-grab xl:active:cursor-grabbing"
      draggable={!!onDragStart}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", g.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.(g.id);
      }}
    >
      <Link href={`/goals/${g.id}`} className="flex items-center gap-3">
        <ProgressRing p={g.p} color={color} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 font-semibold hover:underline">{g.title}</span>
          <span className="block text-xs text-ink-soft">{[g.area, g.line, g.due].filter(Boolean).join(" · ")}</span>
          {g.stalled > 0 && <span className="mt-1 inline-block rounded-md bg-highlight px-2 py-0.5 text-xs font-semibold text-highlight-ink">תקוע {g.stalled} ימים</span>}
        </span>
        {/* the trend line needs room: phones and very wide screens, not the four narrow columns */}
        {g.status === "active" && !g.stalled && (
          <span className="xl:hidden 2xl:block">
            <Spark points={g.spark} color={color} />
          </span>
        )}
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
      {g.note && <p className="mt-3 line-clamp-2 border-t border-rule pt-2 text-sm text-ink-soft">{g.note}</p>}
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
  // Dragging a card to another column (wide screens): shown at once, saved in the background, put back if saving fails.
  const [moved, setMoved] = useState<Record<string, GoalStatus>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<GoalStatus | null>(null);
  const { error: dropError, run: runDrop } = useRun();
  const statusOf = (c: GoalCard) => moved[c.id] ?? c.status;
  const drop = (s: GoalStatus, id: string) => {
    setOver(null);
    setDragging(null);
    const card = cards.find((c) => c.id === id);
    if (!card || statusOf(card) === s) return;
    setMoved((m) => ({ ...m, [id]: s }));
    const settle = () =>
      setMoved((m) => {
        const n = { ...m };
        delete n[id];
        return n;
      });
    runDrop(async () => {
      try {
        await updateGoal(id, { status: s });
      } finally {
        settle();
      }
    });
  };
  const of = (s: GoalStatus) => cards.filter((c) => statusOf(c) === s).map((c) => ({ ...c, status: s }));
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
          <section
            key={s}
            aria-label={STATUSES[s]}
            className={`${tab === s ? "" : "hidden xl:block"} rounded-xl xl:-m-2 xl:p-2 ${over === s && dragging ? "bg-rule/60" : ""}`}
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (over !== s) setOver(s);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === s ? null : o));
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(s, e.dataTransfer.getData("text/plain") || dragging || "");
            }}
          >
            <h2 className="mb-2 hidden items-baseline justify-between text-sm font-semibold xl:flex">
              {STATUSES[s]}
              <span className="font-normal text-ink-soft">{of(s).length}</span>
            </h2>
            {of(s).length ? (
              <ul className="space-y-3">
                {of(s).map((g) => (
                  <Card key={g.id} g={g} onDragStart={setDragging} />
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-rule-strong px-4 py-6 text-center text-sm text-ink-soft">{empty[s]}</p>
            )}
          </section>
        ))}
      </div>
      <p className="mt-4 hidden text-xs text-ink-soft xl:block">אפשר לגרור מטרה מעמודה לעמודה.</p>
      <Err error={dropError} />
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
  const [about, setAbout] = useState("");
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
          const id = await createGoal({ title, area, color, mode, start: Number(start), target: target === "" ? null : Number(target), unit, due: due || null, why, description: about, status: idea ? "idea" : "active", steps: steps.split("\n") });
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
      <label className="block text-sm">
        <span className="text-ink-soft">תיאור (לא חובה)</span>
        <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={2} maxLength={2000} placeholder="מה בדיוק רוצים להשיג, ומה נחשב גמור" className={`${field} mt-1`} />
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

type Row = { id: string; title: string; due: string | null; done: boolean; note: string | null };
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`;

function CheckList({ rows, today, onToggle, onDelete, onAdd, onNote, addLabel, emptyText }: { rows: Row[]; today: string; onToggle: (id: string, done: boolean) => Promise<unknown>; onDelete: (id: string) => Promise<unknown>; onAdd: (title: string, due: string | null) => Promise<unknown>; onNote: (id: string, note: string) => Promise<unknown>; addLabel: string; emptyText: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
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
          <li key={r.id}>
            <div className="flex min-h-11 items-center gap-1">
              <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
                <input type="checkbox" checked={r.done} onChange={() => toggle(r)} className="size-5 shrink-0 accent-[var(--ink)]" />
                <span className={r.done ? "text-ink-soft line-through" : ""}>{r.title}</span>
              </label>
              {r.due && !r.done && <span className={`shrink-0 px-1 text-xs ${r.due < today ? "font-semibold text-bad" : "text-ink-soft"}`}>{r.due === today ? "היום" : shortDate(r.due)}</span>}
              <button
                type="button"
                aria-label={`${r.note ? "עריכת" : "הוספת"} תיאור ל${r.title}`}
                aria-expanded={editing === r.id}
                onClick={() => {
                  setEditing(editing === r.id ? null : r.id);
                  setDraft(r.note ?? "");
                }}
                className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-bg hover:text-ink"
              >
                <Icon name="pencil" className="size-4" />
              </button>
              <button type="button" aria-label={`מחיקת ${r.title}`} onClick={() => run(() => onDelete(r.id))} className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-bg hover:text-ink">
                <Icon name="close" className="size-4" />
              </button>
            </div>
            {editing === r.id ? (
              <form
                className="mb-2 ms-8 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    () => onNote(r.id, draft),
                    () => setEditing(null),
                  );
                }}
              >
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={500} autoFocus placeholder="תיאור: מה כולל, קישור, מה חסר" aria-label={`תיאור ל${r.title}`} className={`${field} min-w-48 flex-1 text-sm`} />
                <button disabled={pending} className="btn min-h-11 self-end">
                  שמירה
                </button>
              </form>
            ) : (
              r.note && <p className="mb-2 ms-8 whitespace-pre-line text-sm text-ink-soft">{r.note}</p>
            )}
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
  const rows = [...tasks].sort((a, b) => Number(!!a.done_at) - Number(!!b.done_at) || a.sort - b.sort).map((t) => ({ id: t.id, title: t.title, due: t.due, done: !!t.done_at, note: t.note ?? null }));
  return <CheckList rows={rows} today={today} onToggle={setTaskDone} onDelete={deleteTask} onNote={(id, n) => setStepNote("task", id, n)} onAdd={(t, d) => addTask(goalId, t, d)} addLabel="משימה חדשה" emptyText={goalId ? "עוד אין משימות. מה הצעד הראשון?" : "אין משימות פתוחות."} />;
}

export function MilestoneList({ goalId, milestones, today }: { goalId: string; milestones: Milestone[]; today: string }) {
  const rows = milestones.map((m) => ({ id: m.id, title: m.title, due: m.due, done: !!m.done_at, note: m.note ?? null }));
  return <CheckList rows={rows} today={today} onToggle={setMilestoneDone} onDelete={deleteMilestone} onNote={(id, n) => setStepNote("milestone", id, n)} onAdd={(t, d) => addMilestone(goalId, t, d)} addLabel="אבן דרך חדשה" emptyText="אבני דרך הן השלבים הגדולים בדרך. לא חובה." />;
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

export function GoalSettings({ id, status, due, why, description }: { id: string; status: GoalStatus; due: string | null; why: string | null; description: string | null }) {
  const router = useRouter();
  const { pending, error, run } = useRun();
  const [confirm, setConfirm] = useState(false);
  const [d, setD] = useState(due ?? "");
  const [w, setW] = useState(why ?? "");
  const [about, setAbout] = useState(description ?? "");
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
          run(() => updateGoal(id, { due: d || null, why: w, description: about }));
        }}
      >
        <label className="block w-full text-sm">
          <span className="text-ink-soft">תיאור המטרה</span>
          <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={3} maxLength={2000} placeholder="מה בדיוק רוצים להשיג, ומה נחשב גמור" className={`${field} mt-1`} />
        </label>
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

/* ---------- Time on a goal: timer, quick log, weekly target ---------- */

export function GoalTime({ goalId, title, week, weekly, total, scheduled }: { goalId: string; title: string; week: number; weekly: number; total: number; scheduled: boolean }) {
  const [timer, setTimer] = useState<number | null>(null);
  const [w, setW] = useState(weekly);
  const { pending, error, run } = useRun();
  const pct = weekly ? Math.min(100, Math.round((week / weekly) * 100)) : 0;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm">
          <b>{duration(week)}</b> השבוע{weekly ? ` מתוך ${duration(weekly)}` : ""}
          {total > week && <span className="text-ink-soft">, {duration(total)} בסך הכל</span>}
        </p>
        {weekly > 0 && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-rule" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="הזמן השבועי">
            <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div>
        <p className="text-sm text-ink-soft">להתחיל טיימר</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {[25, 45, 60].map((m) => (
            <button key={m} type="button" onClick={() => setTimer(m)} className="btn-primary min-h-11 px-4">
              {m} דק׳
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm text-ink-soft">או לרשום זמן שכבר עבדתי</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {[15, 30, 60, 90].map((m) => (
            <button key={m} type="button" disabled={pending} onClick={() => run(() => logGoalTime(goalId, m))} className="btn min-h-11">
              {duration(m)}
            </button>
          ))}
        </div>
      </div>
      <form
        className="border-t border-rule pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => setGoalWeekly(goalId, w));
        }}
      >
        <label className="block text-sm">
          <span className="flex justify-between text-ink-soft">
            <span>כמה זמן בשבוע למטרה?</span>
            <b className="text-ink">{w ? duration(w) : "בלי זמן קבוע"}</b>
          </span>
          <input type="range" min={0} max={600} step={15} value={w} onChange={(e) => setW(Number(e.target.value))} className="mt-2 w-full" />
        </label>
        <p className="mt-1 text-xs text-ink-soft">{scheduled && weekly > 0 ? "משובץ בלוח כשגרה גמישה. סימון השגרה רושם את הזמן כאן." : "עם זמן שבועי, המטרה משתבצת בלוח כשגרה גמישה בזמן פנוי."}</p>
        {w !== weekly && (
          <button disabled={pending} className="btn mt-2 min-h-11">
            שמירה
          </button>
        )}
      </form>
      <Err error={error} />
      {timer != null && (
        <FocusTimer
          storageKey={`focus:goal:${goalId}`}
          title={title}
          minutes={timer}
          onClose={() => setTimer(null)}
          onFinish={(studied) => {
            setTimer(null);
            run(() => logGoalTime(goalId, studied));
          }}
        />
      )}
    </div>
  );
}

/* ---------- Progress journal: short updates in the user's own words ---------- */

export function GoalJournal({ goalId, notes, today }: { goalId: string; notes: { id: string; date: string; body: string }[]; today: string }) {
  const [body, setBody] = useState("");
  const { pending, error, run } = useRun();
  const label = (iso: string) => (iso === today ? "היום" : `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}${iso.slice(0, 4) === today.slice(0, 4) ? "" : `.${iso.slice(2, 4)}`}`);
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          run(
            () => addGoalNote(goalId, body),
            () => setBody(""),
          );
        }}
      >
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={1000} placeholder="מה התקדם, מה נתקע, מה הלאה. כמה שורות לעצמי." aria-label="עדכון התקדמות חדש" className={field} />
        <div className="mt-2 flex items-center gap-3">
          <button disabled={pending || !body.trim()} className="btn-primary min-h-11 px-5">
            הוספת עדכון
          </button>
          <span className="text-xs text-ink-soft">נשמר עם התאריך של היום</span>
        </div>
      </form>
      <Err error={error} />
      {notes.length > 0 && (
        <ol className="mt-4 divide-y divide-rule border-t border-rule">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-3 py-3">
              <time dateTime={n.date} className="w-12 shrink-0 pt-0.5 text-sm font-semibold tabular-nums">
                {label(n.date)}
              </time>
              <p className="min-w-0 flex-1 whitespace-pre-line text-[15px] leading-relaxed">{n.body}</p>
              <button type="button" aria-label={`מחיקת העדכון מ־${label(n.date)}`} disabled={pending} onClick={() => run(() => deleteGoalNote(n.id))} className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-bg hover:text-ink">
                <Icon name="close" className="size-4" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
