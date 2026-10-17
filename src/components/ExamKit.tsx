"use client";

import { useEffect, useState } from "react";

const ITEMS = ["תעודת זהות", "אישור זכאות / הזמנה לבחינה", "עטים (שניים לפחות)", "מחשבון, אם מותר", "דף נוסחאות, אם מותר", "מים ומשהו לאכול", "לצאת בזמן, עם מרווח"];

/** Exam day (and the day before): a checklist that remembers what you've packed. */
export function ExamKit({ day }: { day: number }) {
  const key = `examkit:${new Date().toISOString().slice(0, 10)}`;
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem(key) ?? "[]"));
    } catch {}
  }, [key]);
  const toggle = (i: string) =>
    setDone((d) => {
      const next = d.includes(i) ? d.filter((x) => x !== i) : [...d, i];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });
  return (
    <div className="border-t border-bg/15 px-5 py-3">
      <p className="text-sm font-semibold">{day === 0 ? "ערכת יום בחינה" : "להכין למחר"} · {done.length}/{ITEMS.length}</p>
      <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
        {ITEMS.map((i) => (
          <li key={i}>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={done.includes(i)} onChange={() => toggle(i)} className="size-4 accent-[var(--bg)]" />
              <span className={done.includes(i) ? "line-through opacity-60" : ""}>{i}</span>
            </label>
          </li>
        ))}
      </ul>
      {done.length === ITEMS.length && <p className="mt-2 text-sm">הכל מוכן. בהצלחה! 🍀</p>}
    </div>
  );
}
