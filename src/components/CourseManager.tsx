"use client";

import { useState, useTransition } from "react";
import { addCourse, removeCourse, updateCourseLook } from "@/app/actions";
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
        placeholder="20441"
        dir="ltr"
        className="w-24 rounded-lg border border-rule bg-surface px-3 py-2 text-center tabular-nums"
      />
      <button disabled={pending} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg disabled:opacity-60">
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
    <details className="mt-3">
      <summary className="cursor-pointer text-ink">שם קצר וצבע</summary>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== short && start(() => updateCourseLook(code, { short: name }))}
          maxLength={24}
          className="w-36 rounded-md border border-rule bg-surface px-2 py-1 text-ink"
          aria-label="שם קצר"
        />
        <span className="flex gap-1.5">
          {Object.entries(PALETTE).map(([key, p]) => (
            <button
              key={key}
              type="button"
              disabled={pending}
              onClick={() => start(() => updateCourseLook(code, { color: key }))}
              className={`size-6 rounded-full ${key === color ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""}`}
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
          className="ms-auto text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink"
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
