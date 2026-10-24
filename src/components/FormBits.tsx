"use client";

import { useContext, useEffect, useState } from "react";
import { FormFailed } from "@/components/ActionForm";
import { useFormStatus } from "react-dom";

/** Submit button that shows progress, then a short "saved" confirmation. */
export function SaveButton({ children = "שמירה", done = "נשמר" }: { children?: string; done?: string }) {
  const { pending } = useFormStatus();
  const failed = useContext(FormFailed);
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
        {saved && !failed ? done : ""}
      </span>
    </div>
  );
}

export function CopyField({ value, multiline = false }: { value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (multiline)
    return (
      <div className="space-y-2">
        <textarea
          readOnly
          value={value}
          dir="ltr"
          rows={14}
          onFocus={(e) => e.target.select()}
          className="w-full rounded-lg border border-rule bg-bg px-3 py-2 font-mono text-xs leading-relaxed"
          aria-label="קוד הסקריפט"
        />
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="rounded-lg border border-rule px-4 py-2 text-sm hover:border-ink"
        >
          {copied ? "הועתק" : "העתקת הקוד"}
        </button>
      </div>
    );
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
