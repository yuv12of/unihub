/**
 * Colour themes: eight clearly different ones. The CSS for each lives in globals.css under
 * [data-palette]. `light` / `dark` are [bg, surface, ink, highlight] for the picker's preview.
 */
export const PALETTES = {
  default: { label: "כחול לילה", light: ["#f4f6f9", "#ffffff", "#16213a", "#ffe14d"], dark: ["#0c1322", "#131c2f", "#e6ebf5", "#ffd92e"] },
  nordic: { label: "נורדי", light: ["#eceff4", "#f8f9fb", "#2e3440", "#88c0d0"], dark: ["#242933", "#2e3440", "#eceff4", "#88c0d0"] },
  forest: { label: "יער", light: ["#f2f6f2", "#ffffff", "#16301f", "#ffd84d"], dark: ["#0d1611", "#14211a", "#e3efe6", "#ffd84d"] },
  ocean: { label: "ים", light: ["#eef6f8", "#ffffff", "#0f2c3a", "#7ee0d2"], dark: ["#0a1820", "#10232e", "#e0f0f5", "#5fd3c4"] },
  sunset: { label: "שקיעה", light: ["#fbf4ef", "#ffffff", "#3a1d14", "#ffc24d"], dark: ["#1a100d", "#251713", "#f7e9e2", "#ffb547"] },
  sakura: { label: "סקורה", light: ["#fdf4f7", "#ffffff", "#3c2233", "#ffc2d9"], dark: ["#1a1016", "#261821", "#f9e8f0", "#ff9cc3"] },
  grape: { label: "ענבים", light: ["#f6f1f8", "#ffffff", "#34163f", "#d5b3ff"], dark: ["#150b1a", "#211128", "#f3e6f8", "#c79bff"] },
  contrast: { label: "ניגודיות גבוהה", light: ["#ffffff", "#ffffff", "#000000", "#ffe600"], dark: ["#000000", "#0a0a0a", "#ffffff", "#ffe600"] },
} as const;

/** Palettes that were removed (Oct 2026), mapped to the nearest one that stayed, so saved choices keep working. */
export const OLD_PALETTES: Record<string, PaletteKey> = {
  lavender: "grape",
  midnight: "grape",
  rose: "sakura",
  peach: "sunset",
  coffee: "sunset",
  citrus: "sunset",
  sand: "sunset",
  matcha: "forest",
  graphite: "nordic",
  mono: "contrast",
};

/** Any stored palette name → a palette that exists (unknown names fall back to the default). */
export function normalizePalette(p: string | null | undefined): PaletteKey | undefined {
  if (!p) return undefined;
  if (p in PALETTES) return p as PaletteKey;
  return OLD_PALETTES[p] ?? "default";
}
export type PaletteKey = keyof typeof PALETTES;

/** Styles: the same colours, a different feel (CSS under [data-style] in globals.css). */
export const STYLES = {
  classic: { label: "נקי", desc: "קווים דקים, בלי צללים" },
  soft: { label: "רך", desc: "פינות עגולות וצללים עדינים" },
  bold: { label: "נועז", desc: "מסגרות עבות וצל חד" },
  glass: { label: "זכוכית", desc: "משטחים שקופים על רקע צבעוני" },
  notebook: { label: "מחברת", desc: "דף שורות וכותרות מודגשות במרקר" },
} as const;
export type StyleKey = keyof typeof STYLES;

export interface LookPrefs {
  palette?: PaletteKey;
  style?: StyleKey;
  theme?: "system" | "light" | "dark";
  size?: "sm" | "md" | "lg" | "xl";
  calm?: boolean;
  /** Today page sections to hide */
  hidden?: string[];
  /** Spotify playlist id (or full link) for the focus timer */
  music?: string | null;
  /** phone tab bar: up to 4 page paths */
  tabs?: string[];
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
  const pal = normalizePalette(p.palette);
  set("palette", pal && pal !== "default" ? pal : null, "palette");
  set("style", p.style && p.style !== "classic" ? p.style : null, "style");
  set("theme", p.theme && p.theme !== "system" ? p.theme : null, "theme");
  set("size", p.size && p.size !== "md" ? p.size : null, "size");
  set("calm", p.calm ? "1" : null, "calm");
}

/** Inline script for <head>: restores the look before the first paint. */
export const LOOK_BOOT = `try{var d=document.documentElement,s=localStorage,o=${JSON.stringify(OLD_PALETTES)};["theme","palette","style","size","calm"].forEach(function(k){var v=s.getItem(k);if(k==="palette"&&v&&o[v]){v=o[v];s.setItem(k,v)}if(v)d.dataset[k]=v})}catch(e){}`;
