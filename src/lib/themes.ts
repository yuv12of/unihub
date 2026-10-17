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
  midnight: { label: "חצות", swatch: ["#f3f2fb", "#1e1a4a", "#ff9ecf"] },
  matcha: { label: "מאצ׳ה", swatch: ["#f1f4ea", "#26331c", "#c5e86c"] },
  coffee: { label: "קפה", swatch: ["#f5efe9", "#3b2a20", "#f2b880"] },
  peach: { label: "אפרסק", swatch: ["#fff3ec", "#47261b", "#ffb38a"] },
  nordic: { label: "נורדי", swatch: ["#eceff4", "#2e3440", "#88c0d0"] },
  sakura: { label: "סקורה", swatch: ["#fdf4f7", "#3c2233", "#ffc2d9"] },
  citrus: { label: "הדר", swatch: ["#fff8ec", "#33270f", "#ffb020"] },
  grape: { label: "ענבים", swatch: ["#f6f1f8", "#34163f", "#d5b3ff"] },
  graphite: { label: "גרפיט", swatch: ["#eef0f2", "#1f2328", "#ffd166"] },
} as const;
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
  set("palette", p.palette && p.palette !== "default" ? p.palette : null, "palette");
  set("style", p.style && p.style !== "classic" ? p.style : null, "style");
  set("theme", p.theme && p.theme !== "system" ? p.theme : null, "theme");
  set("size", p.size && p.size !== "md" ? p.size : null, "size");
  set("calm", p.calm ? "1" : null, "calm");
}

/** Inline script for <head>: restores the look before the first paint. */
export const LOOK_BOOT = `try{var d=document.documentElement,s=localStorage;["theme","palette","style","size","calm"].forEach(function(k){var v=s.getItem(k);if(v)d.dataset[k]=v})}catch(e){}`;
