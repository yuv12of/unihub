"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { addEvent, findCommonSlots, markNotificationsRead, sendCheer } from "@/app/act";

const CHEERS: [string, string][] = [
  ["👏", "כל הכבוד"],
  ["🔥", "אש"],
  ["💪", "כוח"],
  ["☕", "קפה עליי"],
  ["🍀", "בהצלחה"],
  ["😴", "לכו לישון"],
];

export function CheerButtons({ to, label }: { to: string; label: string }) {
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {CHEERS.map(([e, name]) => (
        <button
          key={e}
          type="button"
          disabled={pending || !!sent}
          onClick={() =>
            start(async () => {
              await sendCheer(to, e, label);
              setSent(e);
            })
          }
          className={`grid size-8 place-items-center rounded-full border text-base transition ${sent === e ? "border-ink bg-highlight" : "border-rule hover:border-ink"} disabled:cursor-default`}
          aria-label={`לשלוח ${name}`}
          title={name}
        >
          {e}
        </button>
      ))}
      {sent && <span className="ms-1 text-xs text-ink-soft">נשלח</span>}
    </span>
  );
}

export interface NoteRow {
  id: string;
  title: string;
  body: string | null;
  url: string;
  created_at: string;
  read_at: string | null;
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return "עכשיו";
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "לפני שעה" : `לפני ${h} שעות`;
  const d = Math.round(h / 24);
  return d === 1 ? "אתמול" : `לפני ${d} ימים`;
};

export function NotificationsList({ items }: { items: NoteRow[] }) {
  const unread = items.some((i) => !i.read_at);
  useEffect(() => {
    if (!unread) return;
    const t = setTimeout(() => markNotificationsRead().catch(() => {}), 2500);
    return () => clearTimeout(t);
  }, [unread]);
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">מה חדש</h2>
      <ul className="panel divide-y divide-rule overflow-hidden">
        {items.map((n) => (
          <li key={n.id}>
            <Link href={n.url} className={`flex items-start gap-3 px-4 py-3 hover:bg-bg/60 ${n.read_at ? "" : "bg-highlight/15"}`}>
              {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-ink" aria-label="חדש" />}
              <span className="min-w-0 flex-1">
                <span className="block text-[15px]">{n.title}</span>
                {n.body && <span className="block text-sm text-ink-soft">{n.body}</span>}
              </span>
              <span className="shrink-0 text-xs text-ink-soft">{ago(n.created_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Pick friends and a length; Unihub finds times when everyone is free and sends the invite. */
export function GroupFinder({ people }: { people: { id: string; name: string; shares: boolean }[] }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(90);
  const [slots, setSlots] = useState<{ date: string; start: string; end: string; label: string }[] | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sharing = people.filter((p) => p.shares);
  if (!people.length) return null;
  return (
    <section className="panel p-5">
      <h2 className="font-semibold">למצוא זמן משותף</h2>
      <p className="mt-1 text-sm text-ink-soft">בוחרים חברים ואורך, ו־Unihub מוצא מתי כולם פנויים בשבוע הקרוב.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {people.map((p) => {
          const on = chosen.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              disabled={!p.shares}
              title={p.shares ? undefined : "לא משתף/ת לו״ז"}
              onClick={() => {
                setChosen(on ? chosen.filter((x) => x !== p.id) : [...chosen, p.id]);
                setSlots(null);
              }}
              className={`rounded-full border px-3 py-1 text-sm ${on ? "border-ink bg-ink text-bg" : "border-rule"} disabled:opacity-40`}
            >
              {p.name.split(" ")[0]}
            </button>
          );
        })}
      </div>
      {sharing.length < people.length && <p className="mt-1 text-xs text-ink-soft">אפורים = לא משתפים לו״ז, אז אי אפשר לבדוק מתי הם פנויים.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="rounded-lg border border-rule bg-surface px-2 py-1.5">
          {[30, 60, 90, 120, 180, 240].map((m) => (
            <option key={m} value={m}>
              {m < 60 ? `${m} דק׳` : `${m / 60} ש׳`}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!chosen.length || pending}
          onClick={() =>
            start(async () => {
              const r = await findCommonSlots(chosen, minutes);
              setSlots(r.slots);
              setSkipped(r.skipped);
            })
          }
          className="rounded-lg bg-ink px-4 py-1.5 text-bg disabled:opacity-40"
        >
          {pending && !slots ? "מחפש…" : "חיפוש"}
        </button>
      </div>
      {slots && (
        <div className="mt-3 space-y-2">
          {skipped.length > 0 && <p className="text-xs text-ink-soft">בלי: {skipped.join(", ")} (לא משתפים לו״ז).</p>}
          {slots.length === 0 ? (
            <p className="text-sm text-ink-soft">לא נמצא זמן משותף השבוע. אפשר לנסות אורך קצר יותר.</p>
          ) : (
            <>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="מה עושים? (למשל: לימוד ביחד)"
                className="w-full rounded-lg border border-rule bg-surface px-3 py-2 text-sm"
              />
              <ul className="flex flex-wrap gap-2">
                {slots.map((s) => (
                  <li key={s.date + s.start}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          await addEvent({ date: s.date, start: s.start, end: s.end, title: title.trim() || "נפגשים", invite: chosen });
                          setMsg(`נקבע ${s.label} ונשלחו הזמנות`);
                          setSlots(null);
                          setTitle("");
                        })
                      }
                      className="rounded-lg border border-rule px-3 py-1.5 text-sm hover:border-ink"
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </section>
  );
}
