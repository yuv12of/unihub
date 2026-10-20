"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { quickAdd } from "@/app/act";
import { parseQuick } from "@/lib/quickAdd";

const EXAMPLES = [
  "אימון מחר 18:00 עם ספיר",
  "רופא שיניים 3/11 10:30 חצי שעה",
  "ארוחה עם המשפחה שישי ב-20",
  "קפה עם דנה ראשון 9:00",
  "ריצה מחרתיים 7:00 45 דקות",
];

/** One line → an event, with a preview of what was understood before saving. */
export function QuickAdd({ today, people }: { today: string; people: { id: string; name: string }[] }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ex, setEx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const p = useMemo(() => (text.trim() ? parseQuick(text, today, people) : null), [text, today, people]);

  // Rotate the example in the placeholder, to teach what it understands.
  useEffect(() => {
    const t = setInterval(() => setEx((i) => (i + 1) % EXAMPLES.length), 4000);
    return () => clearInterval(t);
  }, []);
  // Home-screen shortcut "הוספה מהירה" opens /?add=1.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("add")) input.current?.focus();
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!p) return input.current?.focus();
        start(async () => {
          setError(null);
          try {
            await quickAdd({ date: p.date, start: p.start, end: p.end, title: p.title, invite: p.invite.map((i) => i.id) });
            setDone(`נוסף: ${p.title}, ${p.dateLabel}${p.start ? ` ${p.start}` : ""}${p.invite.length ? ` · הזמנה נשלחה ל${p.invite.map((i) => i.name).join(" ול")}` : ""}`);
            setText("");
          } catch (err) {
            setError(err instanceof Error ? err.message : "לא נשמר");
          }
        });
      }}
    >
      <div className="flex gap-2">
        <input
          ref={input}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDone(null);
            setError(null);
          }}
          placeholder={`הוספה מהירה: ${EXAMPLES[ex]}`}
          className="min-w-0 flex-1 rounded-xl border border-rule bg-surface px-4 py-2.5 text-[15px] outline-none focus:border-ink"
          aria-label="הוספה מהירה"
          enterKeyHint="done"
        />
        <button disabled={pending} className="rounded-xl bg-ink px-4 text-sm font-medium text-bg disabled:opacity-60">
          {pending ? "…" : "הוספה"}
        </button>
      </div>
      <p className="mt-1.5 min-h-5 text-sm text-ink-soft" aria-live="polite">
        {error ? (
          <span className="text-red-700">{error}</span>
        ) : p ? (
          <>
            <b className="text-ink">{p.title}</b> · {p.dateLabel}
            {p.start ? ` · \u2066${p.start}–${p.end}\u2069` : " · כל היום"}
            {p.invite.length > 0 && ` · עם ${p.invite.map((i) => i.name).join(", ")}`}
            {p.unknown.length > 0 && <span className="hl"> · לא מצאתי: {p.unknown.join(", ")}</span>}
          </>
        ) : (
          done
        )}
      </p>
    </form>
  );
}
