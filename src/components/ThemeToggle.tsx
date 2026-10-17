"use client";

import { useEffect, useState } from "react";
import { saveLook } from "@/app/actions";

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
    saveLook({ theme: t }).catch(() => {});
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
