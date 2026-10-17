"use client";

import { useState, useTransition } from "react";
import { familyCheer } from "@/app/familyActions";

const OPTIONS: [string, string][] = [
  ["❤️", "גאים בך"],
  ["💪", "בהצלחה!"],
  ["🍀", "בהצלחה בבחינה"],
  ["☕", "קחו הפסקה"],
  ["😴", "לכו לישון"],
];

export function FamilyCheers({ token }: { token: string }) {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map(([e, text]) => (
          <button
            key={e}
            type="button"
            disabled={pending || !!sent}
            onClick={() =>
              start(async () => {
                const r = await familyCheer(token, e, text);
                if (r.ok) setSent(text);
                else setError(r.error ?? "לא נשלח");
              })
            }
            className={`rounded-full border px-3 py-1.5 text-sm ${sent === text ? "border-ink bg-highlight" : "border-rule hover:border-ink"}`}
          >
            {e} {text}
          </button>
        ))}
      </div>
      {sent && <p className="mt-2 text-sm">נשלח 💌</p>}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
