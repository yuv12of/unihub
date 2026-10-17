/** Colour themes. The CSS for each lives in globals.css under [data-palette]. */
export const PALETTES = {
  default: { label: "כחול לילה", swatch: ["#f4f6f9", "#16213a", "#ffe14d"] },
  forest: { label: "יער", swatch: ["#f2f6f2", "#16301f", "#ffd84d"] },
  ocean: { label: "ים", swatch: ["#eef6f8", "#0f2c3a", "#7ee0d2"] },
  sunset: { label: "שקיעה", swatch: ["#fbf4ef", "#3a1d14", "#ffc24d"] },
  lavender: { label: "לבנדר", swatch: ["#f5f3fb", "#2a2148", "#ffe14d"] },
  rose: { label: "ורד", swatch: ["#fbf3f5", "#3d1726", "#ffd1dc"] },
  sand: { label: "חול", swatch: ["#f7f2e8", "#3b2f1e", "#ffd65c"] },
  mono: { label: "שחור לבן", swatch: ["#f4f4f4", "#111111", "#ffe600"] },
  contrast: { label: "ניגודיות גבוהה", swatch: ["#ffffff", "#000000", "#ffe600"] },
} as const;
export type PaletteKey = keyof typeof PALETTES;

export interface LookPrefs {
  palette?: PaletteKey;
  theme?: "system" | "light" | "dark";
  size?: "sm" | "md" | "lg" | "xl";
  calm?: boolean;
  /** Today page sections to hide */
  hidden?: string[];
  /** Spotify playlist id (or full link) for the focus timer */
  music?: string | null;
}

/** Applies look prefs to <html> and remembers them in this browser (read before first paint). */
export function applyLook(p: LookPrefs) {
  const el = document.documentElement;
  const set = (k: string, v: string | undefined | null, store: string) => {
    if (v) el.dataset[k] = v;
    else delete el.dataset[k];
    try {
      if (v) localStorage.setItem(store, v);
      else localStorage.removeItem(store);
    } catch {}
  };
  set("palette", p.palette && p.palette !== "default" ? p.palette : null, "palette");
  set("theme", p.theme && p.theme !== "system" ? p.theme : null, "theme");
  set("size", p.size && p.size !== "md" ? p.size : null, "size");
  set("calm", p.calm ? "1" : null, "calm");
}

/** Inline script for <head>: restores the look before the first paint. */
export const LOOK_BOOT = `try{var d=document.documentElement,s=localStorage;["theme","palette","size","calm"].forEach(function(k){var v=s.getItem(k);if(v)d.dataset[k]=v})}catch(e){}`;
