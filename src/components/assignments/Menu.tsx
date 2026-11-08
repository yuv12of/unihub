"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/** A "⋯" button with a short list of actions. Closes on choice, outside click, or Escape. */
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    box.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!items.length) return null;
  return (
    <div ref={box} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        className="btn-ghost size-9 !px-0"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden className="text-lg leading-none tracking-tighter">⋯</span>
      </button>
      {open && (
        <ul
          id={id}
          role="menu"
          aria-label={label}
          className="absolute end-0 top-10 z-30 min-w-52 overflow-hidden rounded-xl border border-rule-strong bg-surface py-1 text-sm shadow-lg"
          onKeyDown={(e) => {
            const all = [...(e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
            const i = all.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === "ArrowDown") (all[i + 1] ?? all[0])?.focus();
            else if (e.key === "ArrowUp") (all[i - 1] ?? all.at(-1))?.focus();
            else return;
            e.preventDefault();
          }}
        >
          {items.map((it) => (
            <li key={it.label} role="none">
              <button
                type="button"
                role="menuitem"
                className={`block w-full px-4 py-2.5 text-start hover:bg-bg focus-visible:bg-bg focus-visible:outline-none ${it.danger ? "text-bad" : ""}`}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
