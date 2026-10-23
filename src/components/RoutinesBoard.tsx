"use client";
import { duration } from "@/lib/time";

import { useOptimistic, useState, useTransition } from "react";
import { answerRoutine, deleteRoutine, saveRoutine, toggleRoutine, type RoutineInput } from "@/app/act";
import {
  CATEGORY,
  DAY_LETTERS,
  TEMPLATES,
  WINDOWS,
  describe,
  emojiOf,
  timesAWeek,
  toHHMM,
  toMin,
  type Occurrence,
  type Routine,
  type RoutineCategory,
  type RoutineLog,
  type TimeWindow,
} from "@/lib/routines";
import type { Person, RoutineWithMembers } from "@/lib/userdata";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";

type BoardRoutine = RoutineWithMembers & {
  progress: { done: number; target: number };
  streak: { count: number; unit: "days" | "weeks" };
};

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function RoutinesBoard({
  me,
  today,
  weekStart,
  routines,
  occurrences,
  logs,
  names,
  people,
}: {
  me: string;
  today: string;
  weekStart: string;
  routines: BoardRoutine[];
  occurrences: Occurrence[];
  logs: RoutineLog[];
  names: Record<string, Person>;
  people: Person[];
}) {
  const [editing, setEditing] = useState<Partial<RoutineInput> | null>(null);
  const invites = routines.filter((r) => r.role === "pending");
  const mine = routines.filter((r) => r.role !== "pending");
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const order: RoutineCategory[] = ["sleep", "meal", "sport", "health", "habit", "chore", "hobby", "social", "other"];
  const groups = order
    .map((c) => ({ c, list: mine.filter((r) => r.category === c) }))
    .filter((g) => g.list.length);

  return (
    <div className="mt-6 space-y-8">
      <section aria-labelledby="add-title">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="add-title" className="sr-only">
            הוספת שגרה
          </h2>
          <button
            type="button"
            onClick={() => setEditing({ mode: "fixed", category: "other", days: [0, 1, 2, 3, 4], start_time: "08:00", minutes: 30, time_window: "any", blocks_study: true })}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-bg"
          >
            ＋ שגרה חדשה
          </button>
          <span className="text-sm text-ink-soft">או מהירות:</span>
          <div className="-mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-full sm:flex-wrap sm:px-0">
            {TEMPLATES.filter((t) => !mine.some((r) => r.title === t.title)).map((t) => (
              <button
                key={t.title}
                type="button"
                onClick={() => setEditing({ ...t, per_week: t.per_week ?? undefined })}
                className="shrink-0 rounded-full border border-rule bg-surface px-3 py-1.5 text-sm hover:border-ink"
              >
                {t.emoji} {t.title}
              </button>
            ))}
          </div>
        </div>
      </section>

      {invites.length > 0 && (
        <section>
          <h2 className="section-title mb-3">הזמנות לשגרה משותפת</h2>
          <ul className="panel divide-y divide-rule">
            {invites.map((r) => (
              <InviteRow key={r.id} r={r} from={names[r.user_id]} />
            ))}
          </ul>
        </section>
      )}

      {mine.length === 0 ? (
        <p className="panel max-w-xl p-6 text-ink-soft">
          עוד אין שגרות. כדאי להתחיל משינה וארוחות (כדי שהתוכנית לא תשבץ לימוד בזמנים האלה), ואז להוסיף ספורט, הרגלים וזמן עם אנשים.
        </p>
      ) : (
        groups.map(({ c, list }) => (
          <section key={c}>
            <h2 className="section-title mb-3">
              {CATEGORY[c].emoji} {CATEGORY[c].label}
            </h2>
            <ul className="grid gap-3 lg:grid-cols-2">
              {list.map((r) => (
                <RoutineCard
                  key={r.id}
                  r={r}
                  me={me}
                  today={today}
                  days={days}
                  occ={occurrences.filter((o) => o.routineId === r.id)}
                  logs={logs.filter((l) => l.routine_id === r.id)}
                  names={names}
                  onEdit={() =>
                    setEditing({
                      id: r.id,
                      title: r.title,
                      emoji: r.emoji,
                      category: r.category,
                      mode: r.mode,
                      days: r.days,
                      start_time: r.start_time,
                      minutes: r.minutes,
                      per_week: r.per_week,
                      time_window: r.time_window,
                      blocks_study: r.blocks_study,
                    })
                  }
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {editing && <RoutineForm initial={editing} people={people} onClose={() => setEditing(null)} />}
    </div>
  );
}

function InviteRow({ r, from }: { r: Routine; from?: Person }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="text-2xl" aria-hidden>
        {emojiOf(r)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{r.title}</div>
        <div className="text-sm text-ink-soft">
          {from?.name ?? "מישהו"} מזמין/ה אותך · {describe(r)}
        </div>
      </div>
      <button disabled={pending} onClick={() => start(() => answerRoutine(r.id, true))} className="rounded-full bg-ink px-3 py-1.5 text-sm text-bg">
        הצטרפות
      </button>
      <button
        disabled={pending}
        onClick={() => start(() => answerRoutine(r.id, false))}
        className="rounded-full border border-rule px-3 py-1.5 text-sm text-ink-soft"
      >
        לא תודה
      </button>
    </li>
  );
}

function RoutineCard({
  r,
  me,
  today,
  days,
  occ,
  logs,
  names,
  onEdit,
}: {
  r: BoardRoutine;
  me: string;
  today: string;
  days: string[];
  occ: Occurrence[];
  logs: RoutineLog[];
  names: Record<string, Person>;
  onEdit: () => void;
}) {
  const [, start] = useTransition();
  const myLogs = new Set(logs.filter((l) => l.user_id === me).map((l) => l.date));
  const [done, setDone] = useOptimistic(myLogs, (s, { date, on }: { date: string; on: boolean }) => {
    const n = new Set(s);
    if (on) n.add(date);
    else n.delete(date);
    return n;
  });
  const partners = [r.user_id, ...r.members.filter((m) => m.status === "accepted").map((m) => m.user_id)].filter((id) => id !== me);
  const doneBy = (date: string) => partners.filter((p) => logs.some((l) => l.user_id === p && l.date === date));
  const color = CATEGORY[r.category].color;

  return (
    <li className="panel p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>
          {emojiOf(r)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{r.title}</div>
          <div className="text-sm text-ink-soft">{describe(r)}{r.starts_on && r.starts_on > today ? ` · מתחיל ב־${Number(r.starts_on.slice(8))}.${Number(r.starts_on.slice(5, 7))}` : ""}</div>
          {partners.length > 0 && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-soft">
              ביחד עם
              {partners.map((p) => (
                <span key={p} className="inline-flex items-center gap-1">
                  <Avatar name={names[p]?.name ?? "?"} url={names[p]?.avatar_url} size={16} />
                  {names[p]?.name?.split(" ")[0]}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-end text-xs leading-tight text-ink-soft">
          <div className="tabular-nums">
            <b className="text-ink">{Math.min(r.progress.done, r.progress.target)}</b>/{r.progress.target} השבוע
          </div>
          {r.streak.count > 1 && (
            <div className="mt-0.5">
              🔥 {r.streak.count} {r.streak.unit === "days" ? "ימים" : "שבועות"} ברצף
            </div>
          )}
        </div>
        {r.role === "owner" ? (
          <button onClick={onEdit} className="shrink-0 text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">
            עריכה
          </button>
        ) : (
          <button
            onClick={() => start(() => answerRoutine(r.id, false))}
            className="shrink-0 text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink"
          >
            יציאה
          </button>
        )}
      </div>

      <ol className="mt-3 grid grid-cols-7 gap-1" aria-label="השבוע">
        {days.map((d, i) => {
          const o = occ.find((x) => x.date === d);
          const isDone = done.has(d);
          const can = d <= today;
          const others = doneBy(d);
          return (
            <li key={d} className="text-center">
              <div className={`text-[11px] ${d === today ? "font-semibold text-ink" : "text-ink-soft"}`}>{DAY_LETTERS[i]}</div>
              <button
                type="button"
                disabled={!can}
                onClick={() =>
                  start(async () => {
                    setDone({ date: d, on: !isDone });
                    await toggleRoutine(r.id, d, !isDone);
                  })
                }
                className={`relative mx-auto mt-1 grid size-9 place-items-center rounded-full border-2 text-xs transition-colors disabled:cursor-default ${
                  isDone ? "text-white" : o ? "" : "border-transparent"
                } ${d === today ? "ring-2 ring-highlight ring-offset-1 ring-offset-surface" : ""}`}
                style={{
                  borderColor: isDone || o ? color : undefined,
                  background: isDone ? color : undefined,
                  opacity: !can && !o ? 0.35 : 1,
                }}
                aria-pressed={isDone}
                aria-label={`${DAY_LETTERS[i]}׳${o?.start ? ` ${o.start}` : ""}${isDone ? ", בוצע" : ""}`}
                title={o?.start ? `\u2066${o.start}–${o.end}\u2069` : undefined}
              >
                {isDone ? "✓" : o?.start ? <span className="text-[10px] tabular-nums text-ink-soft">{o.start}</span> : ""}
                {others.length > 0 && (
                  <span className="absolute -bottom-1 -end-1 grid size-4 place-items-center rounded-full bg-surface text-[9px] ring-1 ring-rule" aria-label="גם השותף/ה סימן/ה">
                    <Icon name="users" className="size-2.5" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </li>
  );
}

const DURATIONS = [0, 10, 15, 20, 25, 30, 45, 60, 90, 120, 150, 180, 240, 300, 480];
/** The list always includes the routine's own length, so opening the editor never changes it. */
const withValue = (list: number[], v: number) => (list.includes(v) ? list : [...list, v].sort((a, b) => a - b));
const durLabel = (m: number) => (m === 0 ? "בלי זמן (רק לסמן)" : duration(m));

function RoutineForm({ initial, people, onClose }: { initial: Partial<RoutineInput>; people: Person[]; onClose: () => void }) {
  const [f, setF] = useState<RoutineInput>({
    title: "",
    emoji: null,
    category: "other",
    mode: "fixed",
    days: [0, 1, 2, 3, 4, 5, 6],
    start_time: "08:00",
    minutes: 30,
    per_week: 3,
    time_window: "any",
    blocks_study: true,
    share_with: [],
    ...initial,
  } as RoutineInput);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof RoutineInput>(k: K, v: RoutineInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const sleep = f.category === "sleep";
  const wake = f.start_time ? toHHMM(toMin(f.start_time) + (f.minutes || 0)) : "07:00";
  const field = "rounded-lg border border-rule bg-surface px-3 py-2";

  const submit = () =>
    start(async () => {
      setError(null);
      try {
        await saveRoutine(sleep ? { ...f, mode: "fixed" } : f);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה");
      }
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" role="dialog" aria-modal aria-label="שגרה">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="section-title">{f.id ? "עריכת שגרה" : "שגרה חדשה"}</h2>
          <button onClick={onClose} className="-m-2 grid size-9 place-items-center rounded-full text-ink-soft hover:bg-bg hover:text-ink" aria-label="סגירה">
            <Icon name="close" className="size-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <input
              value={f.emoji ?? ""}
              onChange={(e) => set("emoji", e.target.value)}
              placeholder={CATEGORY[f.category as RoutineCategory].emoji}
              className={`${field} w-14 text-center text-lg`}
              aria-label="אימוג׳י"
              maxLength={4}
            />
            <input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="למשל: אימון כוח" className={`${field} min-w-0 flex-1`} aria-label="שם" autoFocus />
          </div>

          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="סוג">
            {(Object.keys(CATEGORY) as RoutineCategory[]).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={f.category === c}
                onClick={() => set("category", c)}
                className={`rounded-full border px-3 py-1 text-sm ${f.category === c ? "border-ink bg-ink text-bg" : "border-rule text-ink-soft"}`}
              >
                {CATEGORY[c].emoji} {CATEGORY[c].label}
              </button>
            ))}
          </div>

          {sleep ? (
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                הולך/ת לישון
                <input
                  type="time"
                  dir="ltr"
                  value={f.start_time ?? "23:30"}
                  onChange={(e) => setF((x) => ({ ...x, start_time: e.target.value, minutes: (toMin(wake) - toMin(e.target.value) + 1440) % 1440 }))}
                  className={field}
                />
              </label>
              <label className="flex items-center gap-2">
                קם/ה
                <input
                  type="time"
                  dir="ltr"
                  value={wake}
                  onChange={(e) => set("minutes", (toMin(e.target.value) - toMin(f.start_time ?? "23:30") + 1440) % 1440)}
                  className={field}
                />
              </label>
              <p className="w-full text-sm text-ink-soft">
                {Math.floor(f.minutes / 60)} שעות ו־{f.minutes % 60} דקות שינה. הלוח לא ישבץ כלום בזמן הזה, ושגרות גמישות יתחילו רק אחרי הקימה.
              </p>
            </div>
          ) : (
            <>
              <div className="flex rounded-lg bg-bg p-1 text-sm" role="tablist">
                {(["fixed", "flexible"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={f.mode === m}
                    onClick={() => set("mode", m)}
                    className={`flex-1 rounded-md px-3 py-1.5 ${f.mode === m ? "bg-surface font-medium shadow-sm" : "text-ink-soft"}`}
                  >
                    {m === "fixed" ? "בימים ושעה קבועים" : "מטרה שבועית גמישה"}
                  </button>
                ))}
              </div>

              {f.mode === "fixed" ? (
                <>
                  <div className="flex gap-1.5" aria-label="ימים">
                    {DAY_LETTERS.map((l, d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={f.days.includes(d)}
                        onClick={() => set("days", f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d])}
                        className={`size-9 rounded-full border text-sm ${f.days.includes(d) ? "border-ink bg-ink text-bg" : "border-rule"}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {f.minutes > 0 && (
                      <label className="flex items-center gap-2">
                        בשעה
                        <input type="time" dir="ltr" value={f.start_time ?? "08:00"} onChange={(e) => set("start_time", e.target.value)} className={field} />
                      </label>
                    )}
                    <label className="flex items-center gap-2">
                      משך
                      <select value={f.minutes} onChange={(e) => set("minutes", Number(e.target.value))} className={field}>
                        {withValue(DURATIONS, f.minutes).map((m) => (
                          <option key={m} value={m}>
                            {durLabel(m)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {f.minutes > 0 && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={f.blocks_study} onChange={(e) => set("blocks_study", e.target.checked)} className="size-4" />
                      לא לשבץ לימוד בזמן הזה
                    </label>
                  )}
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2">
                    <select value={f.per_week ?? 3} onChange={(e) => set("per_week", Number(e.target.value))} className={field}>
                      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                        <option key={n} value={n}>
                          {timesAWeek(n)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    משך
                    <select value={f.minutes} onChange={(e) => set("minutes", Number(e.target.value))} className={field}>
                      {withValue(DURATIONS, f.minutes).map((m) => (
                        <option key={m} value={m}>
                          {durLabel(m)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {f.minutes > 0 && (
                    <label className="flex items-center gap-2">
                      מתי
                      <select value={f.time_window} onChange={(e) => set("time_window", e.target.value as TimeWindow)} className={field}>
                        {(Object.keys(WINDOWS) as TimeWindow[]).map((w) => (
                          <option key={w} value={w}>
                            {WINDOWS[w].label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <p className="w-full text-sm text-ink-soft">
                    Unihub מפזר את הפעמים על פני השבוע ומשבץ אותן בזמן פנוי, אחרי מפגשי הלימוד. מה שכבר סימנת השבוע נספר.
                  </p>
                </div>
              )}
            </>
          )}

          {people.length > 0 && !f.id && (
            <fieldset>
              <legend className="text-sm font-medium">לעשות ביחד עם</legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {people.map((p) => {
                  const on = f.share_with?.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set("share_with", on ? f.share_with!.filter((x) => x !== p.id) : [...(f.share_with ?? []), p.id])}
                      className={`flex items-center gap-1.5 rounded-full border py-1 pe-3 ps-1 text-sm ${on ? "border-ink bg-ink text-bg" : "border-rule"}`}
                    >
                      <Avatar name={p.name} url={p.avatar_url} emoji={p.avatar_emoji} color={p.avatar_color} size={22} />
                      {p.name.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-ink-soft">הם יקבלו הזמנה, ואחרי שיצטרפו כל אחד מסמן אצלו וכולם רואים.</p>
            </fieldset>
          )}

          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex items-center gap-3">
            <button disabled={pending} onClick={submit} className="rounded-lg bg-ink px-5 py-2.5 font-medium text-bg disabled:opacity-60">
              {pending ? "שומר…" : "שמירה"}
            </button>
            {f.id && (
              <button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await deleteRoutine(f.id!);
                    onClose();
                  })
                }
                className="text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink"
              >
                מחיקה
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
