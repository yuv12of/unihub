"use client";

import { Icon } from "@/components/Icon";

/** Prints the page (or saves it as PDF from the print dialog). */
export function PrintButton({ label = "הדפסה / PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="no-print btn rounded-lg px-3">
      <Icon name="copy" className="size-4" />
      {label}
    </button>
  );
}
