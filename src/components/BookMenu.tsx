"use client";

import { useState, useTransition } from "react";
import { deleteBook } from "@/app/act";

/** "Remove book" with a second tap to confirm (no browser dialogs). */
export function RemoveBook({ id }: { id: string }) {
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="text-sm">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          sure
            ? start(async () => {
                try {
                  await deleteBook(id);
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "לא נמחק");
                }
              })
            : setSure(true)
        }
        onBlur={() => setSure(false)}
        className={sure ? "font-medium text-red-700 dark:text-red-400" : "text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink"}
      >
        {pending ? "מוחק…" : sure ? "למחוק את הספר? לחצו שוב" : "הסרת הספר"}
      </button>
      {err && <span className="ms-2 text-red-700">{err}</span>}
    </span>
  );
}
