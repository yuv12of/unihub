/**
 * Modules: which parts of Unihub a user sees. Stored in profiles.prefs.modules.
 * A missing key means the default, so accounts from before modules existed keep what they had
 * (study on, hobbies on) and goals stay off until someone turns them on.
 * Turning a module off only hides it: nothing is deleted.
 * Client-safe (no server imports).
 */
export type ModuleKey = "study" | "goals" | "hobbies";
export type Modules = Record<ModuleKey, boolean>;

export const MODULE_DEFAULTS: Modules = { study: true, goals: false, hobbies: true };
export const MODULE_KEYS = Object.keys(MODULE_DEFAULTS) as ModuleKey[];

export const MODULE_LABELS: Record<ModuleKey, { label: string; desc: string }> = {
  study: { label: "מצב סטודנט", desc: "קורסים, מטלות, בחינות, ספרים, תרגול, תכנית התואר ודואר מהאוניברסיטה." },
  goals: { label: "מטרות", desc: "לוח מטרות ופרויקטים עם התקדמות ומשימות." },
  hobbies: { label: "תחביבים", desc: "מעקב אחרי תחביבים וזמן שבועי לכל אחד." },
};

type PrefsLike = { modules?: Partial<Record<string, unknown>> | null } | null | undefined;

/** The user's modules with defaults filled in; anything that isn't a boolean is ignored. */
export function modulesOf(prefs: PrefsLike): Modules {
  const m = (prefs?.modules ?? {}) as Record<string, unknown>;
  const out = { ...MODULE_DEFAULTS };
  for (const k of MODULE_KEYS) if (typeof m[k] === "boolean") out[k] = m[k] as boolean;
  return out;
}

export const hasModule = (prefs: PrefsLike, k: ModuleKey) => modulesOf(prefs)[k];

/** True once the user (or the first-visit question) has chosen; false for untouched accounts. */
export const modulesChosen = (prefs: PrefsLike) => !!prefs?.modules && Object.keys(prefs.modules).length > 0;

/** Keeps only known module keys with boolean values (for saving). */
export function cleanModules(patch: unknown): Partial<Modules> {
  const out: Partial<Modules> = {};
  if (!patch || typeof patch !== "object") return out;
  for (const k of MODULE_KEYS) {
    const v = (patch as Record<string, unknown>)[k];
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

/** Pages that belong to a module. Everything else (Today, calendar, routines, friends…) is for everyone. */
export const MODULE_PATHS: Record<ModuleKey, string[]> = {
  study: ["/courses", "/study", "/books", "/degree", "/mail", "/log", "/meetup"],
  goals: ["/goals"],
  hobbies: ["/hobbies"],
};

/** The module a path belongs to, or null. "/log" must not match "/login". */
export function moduleOfPath(path: string): ModuleKey | null {
  for (const k of MODULE_KEYS) if (MODULE_PATHS[k].some((p) => path === p || path.startsWith(p + "/"))) return k;
  return null;
}

/** Can this user open this path? */
export const pathAllowed = (path: string, m: Modules) => {
  const k = moduleOfPath(path);
  return !k || m[k];
};

/** Today sections (prefs.hidden keys) that only make sense for students. */
export const STUDY_TODAY_KEYS = ["deadlines", "reading", "exams", "standings", "degree", "forums", "weekstrip"];

/** Default phone tabs for a set of modules (the user's own choice still wins). */
export function defaultTabs(m: Modules): string[] {
  const want = m.study ? ["/", "/semester", "/courses", "/study"] : ["/", "/semester", "/goals", "/routines", "/hobbies", "/friends"];
  return want.filter((h) => pathAllowed(h, m) && (h !== "/goals" || GOALS_BUILT)).slice(0, 4);
}

/** The goals pages exist (since 13.11.2026). Kept so the switch and tabs can be pulled in one place. */
export const GOALS_BUILT = true;

/** The user's four phone tabs: their own picks that are still visible, topped up from the defaults. */
export function tabsFor(chosen: string[] | null | undefined, m: Modules, exists: (href: string) => boolean = () => true): string[] {
  const ok = (h: string) => pathAllowed(h, m) && exists(h);
  const own = (chosen ?? []).filter(ok);
  if (!chosen?.length) return defaultTabs(m).filter(ok);
  // only pad when a pick disappeared with a module, never when the user deliberately chose fewer
  const lost = chosen.length - own.length;
  const pad = lost > 0 ? defaultTabs(m).filter((h) => ok(h) && !own.includes(h)).slice(0, lost) : [];
  return [...own, ...pad].slice(0, 4);
}

/** Push reminders about study: sessions, deadlines, meetup files. Dropped when study is off. */
export const isStudyPush = (key: string) => /^(s|d|mf)\|/.test(key);

/** The first-visit question: what brings you here? */
export type ModeChoice = "study" | "life" | "both";
export const MODE_PRESETS: Record<ModeChoice, Modules> = {
  study: { study: true, goals: false, hobbies: true },
  life: { study: false, goals: true, hobbies: true },
  both: { study: true, goals: true, hobbies: true },
};
