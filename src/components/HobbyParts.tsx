"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addHobbyItem, createHobby, deleteHobby, deleteHobbyItem, deleteHobbyLog, logHobby, updateHobby, updateHobbyItem } from "@/app/act";
import { Icon } from "@/components/Icon";
import { KINDS, PRESETS, STATUS, minutesText, type HobbyItem, type HobbyKind, type HobbyLog, type ItemStatus } from "@/lib/hobbyMeta";

const field = "w-full rounded-lg border border-rule bg-surface px-3 py-2";

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

/** This week's time against the weekly goal, as a ring. */
export function TimeRing({ minutes, goal, color = "var(--ink)", size = 72 }: { minutes: number; goal: number; color?: string; size?: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const f = goal ? Math.min(1, minutes / goal) : minutes ? 1 : 0;
  return (
    <svg viewBox="0 0 72 72" width={size} height={size} className="shrink-0 -rotate-90" role="img" aria-label={goal ? `${minutesText(minutes)} מתוך ${minutesText(goal)} השבוע` : `${minutesText(minutes)} השבוע`}>
      <circle cx="36" cy="36" r={r} fill="none" stroke="var(--rule)" strokeWidth="7" />
      <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${f * c} ${c}`} />
    </svg>
  );
}

/* ---------- New hobby ---------- */

export function HobbyNew({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");
  const [kind, setKind] = useState<HobbyKind>("other");
  const [weekly, setWeekly] = useState(120);
  const [items, setItems] = useState("");
  const [why, setWhy] = useState("");
  const [schedule, setSchedule] = useState(true);

  const pick = (p: (typeof PRESETS)[number]) => {
    setTitle(p.title);
    setEmoji(p.emoji);
    setKind(p.kind);
    setWeekly(p.weekly);
    setItems(p.items.join("\n"));
    setOpen(true);
  };

  if (!open)
    return (
      <div>
        <p className="text-sm text-ink-soft">להתחיל מאחד מאלה, או מאפס:</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.title} type="button" onClick={() => pick(p)} className="chip">
              <Icon name={KINDS[p.kind].icon} className="size-4 text-ink-soft" />
              {p.title}
            </button>
          ))}
          <button type="button" onClick={() => setOpen(true)} className="btn-primary">
            <Icon name="plus" className="size-4" />
            תחביב אחר
          </button>
        </div>
      </div>
    );

  return (
    <form
      className={`panel max-w-xl space-y-4 p-5 ${pending ? "opacity-70" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const id = await createHobby({ title, emoji, kind, weekly, why, items: items.split("\n"), schedule });
          onDone?.();
          router.push(`/hobbies/${id}`);
        });
      }}
    >
      <div className="flex gap-3">
        <input value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="אימוג׳י" placeholder={KINDS[kind].emoji} className="w-16 shrink-0 rounded-lg border border-rule bg-surface px-2 py-2 text-center text-xl" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={60} placeholder="איך קוראים לתחביב?" aria-label="שם התחביב" className={`${field} text-lg`} />
      </div>
      <label className="block text-sm">
        <span className="text-ink-soft">סוג</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as HobbyKind)} className={`${field} mt-1`}>
          {Object.entries(KINDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.emoji} {v.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="flex justify-between text-ink-soft">
          <span>כמה זמן בשבוע?</span>
          <b className="text-ink">{weekly ? minutesText(weekly) : "בלי יעד"}</b>
        </span>
        <input type="range" min={0} max={600} step={15} value={weekly} onChange={(e) => setWeekly(Number(e.target.value))} className="mt-2 w-full" />
      </label>
      {weekly > 0 && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} className="mt-0.5 size-4" />
          <span>
            לשבץ בלוח השנה
            <span className="block text-xs text-ink-soft">כשגרה גמישה: {Math.max(1, Math.min(7, Math.round(weekly / 60)))} פעמים בשבוע, בזמן פנוי.</span>
          </span>
        </label>
      )}
      <label className="block text-sm">
        <span className="text-ink-soft">{KINDS[kind].items} להתחלה (שורה לכל אחד, לא חובה)</span>
        <textarea value={items} onChange={(e) => setItems(e.target.value)} rows={4} placeholder={KINDS[kind].placeholder} className={`${field} mt-1`} />
      </label>
      <label className="block text-sm">
        <span className="text-ink-soft">למה זה חשוב לך? (לא חובה)</span>
        <input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} placeholder="תזכורת קטנה לימים שאין כוח" className={`${field} mt-1`} />
      </label>
      <Err error={error} />
      <div className="flex gap-2">
        <button disabled={pending} className="rounded-lg bg-ink px-5 py-2 text-sm font-medium text-bg">
          יצירה
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-ink-soft">
          ביטול
        </button>
      </div>
    </form>
  );
}

/* ---------- Logging practice ---------- */

export function QuickLog({ hobbyId, items = [], compact = false }: { hobbyId: string; items?: HobbyItem[]; compact?: boolean }) {
  const { pending, error, run } = useRun();
  const [more, setMore] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const log = (minutes: number, extra: { note?: string; mood?: number | null; item_id?: string | null; date?: string } = {}) =>
    run(
      () => logHobby({ hobby_id: hobbyId, minutes, ...extra }),
      () => {
        setDone(`נרשמו ${minutesText(minutes)}`);
        setMore(false);
        setTimeout(() => setDone(null), 2500);
      },
    );
  return (
    <div className={pending ? "opacity-70" : ""}>
      <div className="flex flex-wrap items-center gap-1.5">
        {!compact && <span className="me-1 text-sm text-ink-soft">תרגלתי:</span>}
        {[15, 30, 45, 60].map((m) => (
          <button key={m} type="button" disabled={pending} onClick={() => log(m)} className="rounded-full border border-rule bg-surface px-3 py-1 text-sm tabular-nums hover:border-ink">
            +{m}
          </button>
        ))}
        <button type="button" onClick={() => setMore((v) => !v)} className="rounded-full px-2 py-1 text-sm text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
          פירוט
        </button>
        {done && (
          <span role="status" className="inline-flex items-center gap-1 text-sm">
            <Icon name="check" className="size-4" />
            {done}
          </span>
        )}
      </div>
      {more && (
        <form
          className="mt-3 grid gap-2 rounded-lg border border-rule p-3 text-sm sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            log(Number(f.get("minutes")), {
              date: String(f.get("date") || ""),
              note: String(f.get("note") || ""),
              mood: Number(f.get("mood")) || null,
              item_id: String(f.get("item") || "") || null,
            });
          }}
        >
          <label>
            <span className="text-ink-soft">דקות</span>
            <input name="minutes" type="number" min={1} max={720} defaultValue={30} required className={`${field} mt-1`} />
          </label>
          <label>
            <span className="text-ink-soft">תאריך</span>
            <input name="date" type="date" dir="ltr" className={`${field} mt-1`} />
          </label>
          {items.length > 0 && (
            <label className="sm:col-span-2">
              <span className="text-ink-soft">על מה עבדת?</span>
              <select name="item" className={`${field} mt-1`}>
                <option value="">כללי</option>
                {items
                  .filter((i) => i.status !== "done")
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="sm:col-span-2">
            <span className="text-ink-soft">הערה</span>
            <input name="note" maxLength={500} placeholder="מה הלך טוב, מה לנסות בפעם הבאה" className={`${field} mt-1`} />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="text-ink-soft">איך היה?</legend>
            <div className="mt-1 flex gap-3">
              {["😣", "😕", "🙂", "😊", "🤩"].map((e, i) => (
                <label key={e} className="cursor-pointer text-xl">
                  <input type="radio" name="mood" value={i + 1} className="peer sr-only" />
                  <span className="rounded-full p-1 opacity-50 peer-checked:bg-bg peer-checked:opacity-100">{e}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2">
            <button disabled={pending} className="rounded-lg bg-ink px-4 py-2 font-medium text-bg">
              רישום
            </button>
          </div>
        </form>
      )}
      <Err error={error} />
    </div>
  );
}

export function LogList({ logs, items }: { logs: HobbyLog[]; items: HobbyItem[] }) {
  const { run } = useRun();
  const [list, remove] = useOptimistic(logs, (s, id: string) => s.filter((l) => l.id !== id));
  if (!list.length) return <p className="text-sm text-ink-soft">עוד לא נרשם תרגול. לחיצה על +30 למעלה רושמת חצי שעה של היום.</p>;
  const moods = ["", "😣", "😕", "🙂", "😊", "🤩"];
  return (
    <ul className="divide-y divide-rule text-sm">
      {list.slice(0, 30).map((l) => (
        <li key={l.id} className="flex items-start gap-3 py-2.5">
          <span className="w-20 shrink-0 text-ink-soft">{new Intl.DateTimeFormat("he-IL", { timeZone: "UTC", weekday: "short", day: "numeric", month: "numeric" }).format(new Date(l.date + "T00:00:00Z"))}</span>
          <span className="w-16 shrink-0 font-medium tabular-nums">{minutesText(l.minutes)}</span>
          <span className="min-w-0 flex-1">
            {l.item_id && <span className="block">{items.find((i) => i.id === l.item_id)?.title}</span>}
            {l.note && <span className="block text-ink-soft">{l.note}</span>}
            {l.routine_date && !l.note && <span className="text-xs text-ink-soft">מהשגרה בלוח</span>}
          </span>
          {l.mood ? <span aria-label={`מצב רוח ${l.mood} מתוך 5`}>{moods[l.mood]}</span> : null}
          <button
            type="button"
            onClick={() =>
              run(async () => {
                remove(l.id);
                await deleteHobbyLog(l.id);
              })
            }
            aria-label="מחיקת הרישום"
            className="text-ink-soft hover:text-ink"
          >
            <Icon name="close" className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Board: want / doing / done ---------- */

export function HobbyBoard({ hobbyId, items, kind }: { hobbyId: string; items: HobbyItem[]; kind: HobbyKind }) {
  const { error, run } = useRun();
  const [list, patch] = useOptimistic(items, (s, p: { id: string; status?: ItemStatus; progress?: number; remove?: boolean }) =>
    p.remove ? s.filter((x) => x.id !== p.id) : s.map((x) => (x.id === p.id ? { ...x, ...(p.status && { status: p.status }), ...(p.progress !== undefined && { progress: p.progress }) } : x)),
  );
  const move = (it: HobbyItem, status: ItemStatus) =>
    run(async () => {
      patch({ id: it.id, status });
      await updateHobbyItem(it.id, { status });
    });
  const cols: ItemStatus[] = ["doing", "want", "done"];
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-3">
        {cols.map((st) => {
          const here = list.filter((i) => i.status === st);
          return (
            <section key={st} className="rounded-xl bg-bg/60 p-3">
              <h3 className="flex items-baseline justify-between px-1 text-sm font-semibold">
                {STATUS[st]}
                <span className="text-xs font-normal text-ink-soft">{here.length}</span>
              </h3>
              <ul className="mt-2 space-y-2">
                {here.map((it) => (
                  <li key={it.id} className="panel p-3 text-sm">
                    <div className="flex items-start gap-2">
                      <span className={`min-w-0 flex-1 ${st === "done" ? "text-ink-soft line-through" : "font-medium"}`}>
                        {it.url ? (
                          <a href={it.url} target="_blank" rel="noreferrer" className="underline decoration-rule underline-offset-4">
                            {it.title}
                          </a>
                        ) : (
                          it.title
                        )}
                      </span>
                      <button
                        type="button"
                        aria-label="מחיקה"
                        onClick={() =>
                          run(async () => {
                            patch({ id: it.id, remove: true });
                            await deleteHobbyItem(it.id);
                          })
                        }
                        className="text-ink-soft hover:text-ink"
                      >
                        <Icon name="close" className="size-3.5" />
                      </button>
                    </div>
                    {st === "doing" && (
                      <label className="mt-2 flex items-center gap-2 text-xs text-ink-soft">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={10}
                          defaultValue={it.progress}
                          onPointerUp={(e) => {
                            const v = Number((e.target as HTMLInputElement).value);
                            run(() => updateHobbyItem(it.id, { progress: v }));
                          }}
                          onKeyUp={(e) => {
                            const v = Number((e.target as HTMLInputElement).value);
                            run(() => updateHobbyItem(it.id, { progress: v }));
                          }}
                          className="flex-1"
                          aria-label={`התקדמות ב${it.title}`}
                        />
                        <span className="w-8 tabular-nums">{it.progress}%</span>
                      </label>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      {cols
                        .filter((c) => c !== st)
                        .map((c) => (
                          <button key={c} type="button" onClick={() => move(it, c)} className="rounded-full border border-rule px-2 py-0.5 text-ink-soft hover:border-ink hover:text-ink">
                            {c === "done" ? "הושלם ✓" : c === "doing" ? "להתחיל" : "לדחות"}
                          </button>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
              <AddItem hobbyId={hobbyId} status={st} placeholder={st === "want" ? KINDS[kind].placeholder : `${KINDS[kind].item} נוסף`} />
            </section>
          );
        })}
      </div>
      <Err error={error} />
    </div>
  );
}

function AddItem({ hobbyId, status, placeholder }: { hobbyId: string; status: ItemStatus; placeholder: string }) {
  const { pending, error, run } = useRun();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [withUrl, setWithUrl] = useState(false);
  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => addHobbyItem({ hobby_id: hobbyId, title, url, status }),
          () => {
            setTitle("");
            setUrl("");
            setWithUrl(false);
          },
        );
      }}
    >
      <div className="flex gap-1.5">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder} aria-label="פריט חדש" className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm hover:border-rule focus:border-rule focus:bg-surface" />
        {title && (
          <button disabled={pending} className="rounded-lg bg-ink px-2.5 text-sm text-bg" aria-label="הוספה">
            <Icon name="plus" className="size-4" />
          </button>
        )}
      </div>
      {title && !withUrl && (
        <button type="button" onClick={() => setWithUrl(true)} className="mt-1 px-2 text-xs text-ink-soft underline decoration-rule underline-offset-4">
          להוסיף קישור (סרטון, תווים, מתכון)
        </button>
      )}
      {withUrl && <input value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr" placeholder="https://" aria-label="קישור" className="mt-1 w-full rounded-lg border border-rule bg-surface px-2 py-1.5 text-sm" />}
      <Err error={error} />
    </form>
  );
}

/* ---------- Settings ---------- */

export function HobbySettings({ id, weekly, why, archived }: { id: string; weekly: number; why: string | null; archived: boolean }) {
  const router = useRouter();
  const { pending, error, run } = useRun();
  const [w, setW] = useState(weekly);
  const [reason, setReason] = useState(why ?? "");
  const [sure, setSure] = useState(false);
  return (
    <div className={`space-y-4 text-sm ${pending ? "opacity-70" : ""}`}>
      <label className="block">
        <span className="flex justify-between text-ink-soft">
          <span>זמן בשבוע</span>
          <b className="text-ink">{w ? minutesText(w) : "בלי יעד"}</b>
        </span>
        <input type="range" min={0} max={600} step={15} value={w} onChange={(e) => setW(Number(e.target.value))} className="mt-2 w-full" />
        <span className="text-xs text-ink-soft">משנה גם את השגרה בלוח השנה.</span>
      </label>
      <label className="block">
        <span className="text-ink-soft">למה זה חשוב לך</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={`${field} mt-1`} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run(() => updateHobby(id, { weekly: w, why: reason }))} className="rounded-lg bg-ink px-4 py-2 font-medium text-bg">
          שמירה
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => updateHobby(id, { archived: !archived }))} className="rounded-lg border border-rule px-3 py-2 text-ink-soft hover:border-ink hover:text-ink">
          {archived ? "החזרה לפעילים" : "הפסקה זמנית"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => (sure ? run(() => deleteHobby(id), () => router.push("/hobbies")) : setSure(true))}
          className={`rounded-lg px-3 py-2 ${sure ? "font-medium text-ink" : "text-ink-soft hover:text-ink"}`}
        >
          {sure ? "למחוק עם כל הרישומים? כן, למחוק" : "מחיקה"}
        </button>
      </div>
      <Err error={error} />
    </div>
  );
}
