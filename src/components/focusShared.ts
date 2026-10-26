"use client";

import { useSyncExternalStore } from "react";

/**
 * Opens the focus timer from anywhere (the timer lives in the app layout): detail
 * { course, book?, idx? } starts a free timer in that course, reading that chapter.
 */
export const FOCUS_EVENT = "unihub:focus";
export interface FocusRequest {
  course: string | null;
  book?: string | null;
  idx?: number | null;
}

/** Whether the window is at least `px` wide, following resizes. */
export function useMinWidth(px: number) {
  const q = `(min-width: ${px}px)`;
  return useSyncExternalStore(
    (change) => {
      const m = window.matchMedia(q);
      m.addEventListener("change", change);
      return () => m.removeEventListener("change", change);
    },
    () => window.matchMedia(q).matches,
    () => false, // server render: the phone layout, corrected right after hydration
  );
}
