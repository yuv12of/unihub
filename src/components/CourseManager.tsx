"use client";

import { Chevron } from "@/components/Icon";
import { useState, useTransition } from "react";
import { addCourse, removeCourse, updateCourseLook } from "@/app/act";
import { PALETTE } from "@/lib/semester";

export function AddCourse({ semester }: { semester: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      action={(fd) =>
        start(async () => {
          setMsg(null);
          try {
            const name = await addCourse(String(fd.get("code") ?? ""));
            setMsg({ ok: true, text: `נוסף: ${name}` });
          } catch (e) {
            setMsg({ ok: false, text: e instanceof Error ? e.message : "לא הצליח" });
          }
        })
      }
      className="flex flex-wrap items-center gap-2"
    >
      <label className="text-sm text-ink-soft" htmlFor="course-code">
        הוספת קורס ({semester})
      </label>
      <input
        id="course-code"
        name="code"
        inputMode="numeric"
        pattern="\d{5}"
        maxLength={5}
        required
        placeholder="מספר קורס, למשל 20441"
        aria-label="מספר קורס (5 ספרות)"
        className="w-56 max-w-full rounded-lg border border-rule-strong bg-surface px-3 py-2 tabular-nums"
      />
      <button disabled={pending} className="btn-primary">
        {pending ? "טוען…" : "הוספה"}
      </button>
      {msg && <span className={`text-sm ${msg.ok ? "" : "text-red-700"}`}>{msg.text}</span>}
    </form>
  );
}

/** Short name, colour and removal, tucked away at the bottom of a course card. */
export function CourseLook({ code, short, color }: { code: string; short: string; color: string }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(short);
  return (
    <details className="group mt-3">
      <summary className="summary-clean flex min-h-10 items-center gap-2 text-ink">
        שם קצר וצבע
        <Chevron />
      </summary>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== short && start(() => updateCourseLook(code, { short: name }))}
          maxLength={24}
          className="w-36 rounded-md border border-rule-strong bg-surface px-2 py-1.5 text-ink"
          aria-label="שם קצר"
        />
        <span className="flex gap-1.5">
          {Object.entries(PALETTE).map(([key, p]) => (
            <button
              key={key}
              type="button"
              disabled={pending}
              onClick={() => start(() => updateCourseLook(code, { color: key }))}
              aria-pressed={key === color}
              className={`size-8 rounded-full ${key === color ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""}`}
              style={{ background: p.css }}
              aria-label={p.label}
              title={p.label}
            />
          ))}
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => confirmRemove() && start(() => removeCourse(code))}
          className="btn-ghost ms-auto"
        >
          הסרת הקורס
        </button>
      </div>
    </details>
  );
}

function confirmRemove() {
  try {
    return window.confirm("להסיר את הקורס? ההתקדמות במטלות נשמרת אם תוסיפו אותו שוב.");
  } catch {
    return true;
  }
}
