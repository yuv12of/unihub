"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

/** Submit button that shows progress, then a short "saved" confirmation. */
export function SaveButton({ children = "שמירה", done = "נשמר" }: { children?: string; done?: string }) {
  const { pending } = useFormStatus();
  const [saved, setSaved] = useState(false);
  const [wasPending, setWasPending] = useState(false);
  useEffect(() => {
    if (pending) setWasPending(true);
    else if (wasPending) {
      setWasPending(false);
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(t);
    }
  }, [pending, wasPending]);
  return (
    <div className="flex items-center gap-3">
      <button
        disabled={pending}
        className="rounded-lg bg-ink px-5 py-2.5 font-medium text-bg disabled:opacity-60"
      >
        {pending ? "שומר…" : children}
      </button>
      <span role="status" className="text-sm text-ink-soft">
        {saved ? done : ""}
      </span>
    </div>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        dir="ltr"
        onFocus={(e) => e.target.select()}
        className="min-w-0 flex-1 rounded-lg border border-rule bg-bg px-3 py-2 font-mono text-xs"
        aria-label="קישור ליומן"
      />
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="shrink-0 rounded-lg border border-rule px-4 py-2 text-sm hover:border-ink"
      >
        {copied ? "הועתק" : "העתקה"}
      </button>
    </div>
  );
}
