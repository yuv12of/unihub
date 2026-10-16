"use client";

import { useMemo, useState, useTransition } from "react";
import { quickAdd } from "@/app/actions";
import { parseQuick } from "@/lib/quickAdd";

/** One line → an event, with a preview of what was understood before saving. */
export function QuickAdd({ today, people }: { today: string; people: { id: string; name: string }[] }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const p = useMemo(() => (text.trim() ? parseQuick(text, today, people) : null), [text, today, people]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!p) return;
        start(async () => {
          await quickAdd({ date: p.date, start: p.start, end: p.end, title: p.title, invite: p.invite.map((i) => i.id) });
          setDone(`נוסף: ${p.title}, ${p.dateLabel}${p.start ? ` ${p.start}` : ""}${p.invite.length ? ` · הזמנה נשלחה ל${p.invite.map((i) => i.name).join(" ול")}` : ""}`);
          setText("");
        });
      }}
    >
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDone(null);
          }}
          placeholder="הוספה מהירה: אימון מחר 18:00 עם ספיר"
          className="min-w-0 flex-1 rounded-xl border border-rule bg-surface px-4 py-2.5 text-[15px] outline-none focus:border-ink"
          aria-label="הוספה מהירה"
        />
        <button disabled={!p || pending} className="rounded-xl bg-ink px-4 text-sm font-medium text-bg disabled:opacity-40">
          {pending ? "…" : "הוספה"}
        </button>
      </div>
      <p className="mt-1.5 min-h-5 text-sm text-ink-soft" aria-live="polite">
        {p ? (
          <>
            <b className="text-ink">{p.title}</b> · {p.dateLabel}
            {p.start ? ` · ${p.start}–${p.end}` : " · כל היום"}
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
