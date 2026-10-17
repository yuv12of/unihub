"use client";

import { useEffect, useState, type ReactNode } from "react";

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

/**
 * A collapsible card. The header always shows the title and a one-line summary, so a closed
 * section still tells you what's inside. Open/closed is remembered per section on this device.
 */
export function Fold({
  id,
  title,
  summary,
  defaultOpen = true,
  children,
  className = "",
  bare = false,
}: {
  id: string;
  title: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  /** no card frame around the content (for content that brings its own panels) */
  bare?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    const v = get(`fold:${id}`);
    if (v != null) setOpen(v === "1");
  }, [id]);
  const toggle = () =>
    setOpen((o) => {
      set(`fold:${id}`, o ? "0" : "1");
      return !o;
    });
  return (
    <section className={bare ? className : `panel overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 text-start ${bare ? "mb-3" : "px-4 py-3.5 sm:px-5"}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold leading-snug">{title}</span>
          {summary && !open && <span className="mt-0.5 block truncate text-sm text-ink-soft">{summary}</span>}
        </span>
        <svg viewBox="0 0 20 20" className={`size-5 shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className={bare ? "" : "border-t border-rule px-4 pb-4 pt-3 sm:px-5"}>{children}</div>}
    </section>
  );
}

/**
 * Tabs for long pages: one part at a time instead of everything stacked. The chosen tab is kept
 * in the address (#tab) so links and the back button work, and remembered for next time.
 */
export function Tabs({
  id,
  tabs,
  anchors = {},
}: {
  id: string;
  tabs: { key: string; label: ReactNode; badge?: number; panel: ReactNode }[];
  /** old #links inside a tab (e.g. "opal" → "calendars"): open that tab and scroll to the element */
  anchors?: Record<string, string>;
}) {
  const [cur, setCur] = useState(tabs[0]?.key);
  useEffect(() => {
    const hash = decodeURIComponent(location.hash.slice(1));
    const saved = get(`tab:${id}`);
    if (anchors[hash]) {
      setCur(anchors[hash]);
      setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }), 50);
      return;
    }
    const pick = [hash, saved].find((k) => k && tabs.some((t) => t.key === k));
    if (pick) setCur(pick);
    // only on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const choose = (k: string) => {
    setCur(k);
    set(`tab:${id}`, k);
    history.replaceState(null, "", `#${k}`);
  };
  return (
    <div>
      <div role="tablist" className="sticky top-[calc(env(safe-area-inset-top)+3.4rem)] z-[5] -mx-4 mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-rule [scrollbar-width:none] bg-bg/90 px-4 backdrop-blur sm:mx-0 sm:px-0 lg:top-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={cur === t.key}
            onClick={() => choose(t.key)}
            className={`relative shrink-0 whitespace-nowrap px-3 py-2.5 text-sm transition-colors ${
              cur === t.key ? "font-semibold text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            {t.label}
            {t.badge ? <span className="ms-1.5 rounded-full bg-ink px-1.5 text-[11px] font-semibold text-bg">{t.badge}</span> : null}
          </button>
        ))}
      </div>
      {/* Only the open tab is mounted, so e.g. "what's new" is marked read only when you look at it. */}
      <div role="tabpanel">{tabs.find((t) => t.key === cur)?.panel}</div>
    </div>
  );
}

/** Cards in a row you swipe through on the phone; a normal grid on wider screens. */
export function Gallery({
  children,
  className = "",
  cols = "sm:grid-cols-2",
  item = "[&>*]:w-[82%]",
  until = "sm",
}: {
  /** swipe below this breakpoint, grid from it up */
  until?: "sm" | "lg";
  children: ReactNode;
  className?: string;
  /** grid columns from the sm breakpoint up */
  cols?: string;
  /** card width while swiping on the phone */
  item?: string;
}) {
  return (
    <div
      className={`-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent_0,#000_32px)] ${
        until === "lg"
          ? "sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:overflow-visible lg:px-0 lg:pb-0 lg:[&>*]:w-auto lg:[mask-image:none]"
          : "sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:pb-0 sm:[&>*]:w-auto sm:[mask-image:none]"
      } ${cols} ${item} [&>*]:shrink-0 [&>*]:snap-start ${className}`}
    >
      {children}
    </div>
  );
}
