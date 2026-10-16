"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "אוטומטי", light: "בהיר", dark: "כהה" };
const ICON: Record<Theme, string> = { system: "◐", light: "☀︎", dark: "☾" };

/** Light / dark / follow the device. Remembered in this browser. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {}
  }, []);
  const apply = (t: Theme) => {
    setTheme(t);
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {}
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute("content", t === "dark" ? "#0c1322" : "#f4f6f9");
  };
  return (
    <button
      type="button"
      onClick={() => apply(NEXT[theme])}
      className="text-ink-soft hover:text-ink"
      aria-label={`ערכת צבעים: ${LABEL[theme]}`}
      title={`ערכת צבעים: ${LABEL[theme]}`}
    >
      {ICON[theme]}
      {!compact && <span className="ms-1.5">{LABEL[theme]}</span>}
    </button>
  );
}
