"use client";

import { useTransition } from "react";
import { setAccountStatus } from "@/app/actions";

export function AccountActions({ id, status }: { id: string; status: "pending" | "approved" | "blocked" }) {
  const [pending, start] = useTransition();
  const btn = "rounded-full px-3 py-1.5 text-sm disabled:opacity-50";
  return (
    <span className="flex gap-2">
      {status !== "approved" && (
        <button type="button" disabled={pending} onClick={() => start(() => setAccountStatus(id, "approved"))} className={`${btn} bg-ink text-bg`}>
          אישור
        </button>
      )}
      {status !== "blocked" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => setAccountStatus(id, "blocked"))}
          className={`${btn} border border-rule text-ink-soft hover:border-ink`}
        >
          {status === "pending" ? "דחייה" : "חסימה"}
        </button>
      )}
    </span>
  );
}
