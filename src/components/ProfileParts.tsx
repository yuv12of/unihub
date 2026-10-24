"use client";

import { useEffect, useState, useTransition } from "react";
import { saveLook, saveProfile, type ProfileInput } from "@/app/act";
import { PALETTES, STYLES, applyLook, normalizePalette, type LookPrefs, type PaletteKey, type StyleKey } from "@/lib/themes";
import { FOCUS_PLAYLISTS, playlistId } from "@/lib/focusMusic";
import { PALETTE } from "@/lib/semester";
import { Avatar } from "@/components/Avatar";
import { DEFAULT_TABS, TAB_CHOICES } from "@/components/Nav";
import { Icon } from "@/components/Icon";

const EMOJIS = ["🦊", "🐼", "🦉", "🐢", "🐙", "🦁", "🐧", "🐝", "🌵", "🌻", "🍀", "⚡", "🚀", "🎧", "📚", "🧠", "☕", "🎨", "⚽", "🎸", "🏀", "🐱", "🐶", "🦄"];

export function ProfileEditor({ initial, photo }: { initial: ProfileInput; photo: string | null }) {
  const [f, setF] = useState(initial);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const field = "w-full rounded-lg border border-rule bg-surface px-3 py-2";
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn">
        עריכת פרופיל
      </button>
    );
  return (
    <div className="panel mt-4 space-y-4 p-5">
      <div className="flex items-center gap-4">
        <Avatar name={f.name || "?"} url={photo} emoji={f.avatar_emoji || null} color={f.avatar_color || null} size={64} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">תמונה</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => set("avatar_emoji", "")}
              className={`rounded-full border px-2.5 py-1 text-xs ${!f.avatar_emoji ? "border-ink" : "border-rule"}`}
            >
              {photo ? "התמונה מ־Google" : "אות ראשונה"}
            </button>
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => set("avatar_emoji", e)}
                className={`grid size-8 place-items-center rounded-full text-lg ${f.avatar_emoji === e ? "ring-2 ring-ink" : ""}`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            {Object.entries(PALETTE).map(([k, p]) => (
              <button
                key={k}
                type="button"
                onClick={() => set("avatar_color", k)}
                className={`size-6 rounded-full ${f.avatar_color === k ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""}`}
                style={{ background: p.css }}
                aria-label={p.label}
              />
            ))}
          </div>
        </div>
      </div>
      <label className="block text-sm">
        שם
        <input value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={60} className={`${field} mt-1`} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          מסלול לימודים
          <input value={f.program} onChange={(e) => set("program", e.target.value)} maxLength={80} placeholder="למשל: מדעי המחשב" className={`${field} mt-1`} />
        </label>
        <label className="block text-sm">
          שנה
          <input value={f.study_year} onChange={(e) => set("study_year", e.target.value)} maxLength={30} placeholder="למשל: שנה א׳" className={`${field} mt-1`} />
        </label>
      </div>
      <label className="block text-sm">
        קצת עליי
        <textarea value={f.bio} onChange={(e) => set("bio", e.target.value)} maxLength={300} rows={3} className={`${field} mt-1`} />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-3">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              try {
                await saveProfile(f);
                setOpen(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : "שגיאה");
              }
            })
          }
          className="btn-primary"
        >
          {pending ? "שומר…" : "שמירה"}
        </button>
        <button onClick={() => setOpen(false)} className="btn-ghost">
          ביטול
        </button>
      </div>
    </div>
  );
}

export const TODAY_SECTIONS: [string, string][] = [
  ["clock", "שעון"],
  ["weekstrip", "השבוע שלי (פס ימים)"],
  ["quickadd", "הוספה מהירה"],
  ["live", "לומדים עכשיו"],
  ["dayoff", "כפתור יום קשה"],
  ["routines", "השגרה של היום"],
  ["deadlines", "הגשות קרובות"],
  ["exams", "ספירה לאחור לבחינות"],
  ["reading", "לקריאה השבוע"],
  ["forums", "חדש בפורומים"],
  ["standings", "מצב בקורסים"],
];

/**
 * Colours, light/dark, text size, calm mode, Today sections, phone tabs (part "look"),
 * or the focus music (part "music").
 */
export function LookPicker({ initial, part = "look" }: { initial: LookPrefs; part?: "look" | "music" }) {
  const [p, setP] = useState<LookPrefs>({ style: "classic", theme: "system", size: "md", hidden: [], ...initial, palette: normalizePalette(initial.palette) ?? "default" });
  const [custom, setCustom] = useState("");
  const [, start] = useTransition();
  const update = (patch: LookPrefs) => {
    const next = { ...p, ...patch };
    setP(next);
    applyLook(next);
    try {
      if ("music" in patch) {
        if (next.music) localStorage.setItem("music", next.music);
        else localStorage.removeItem("music");
      }
    } catch {}
    start(() => saveLook(patch));
  };
  if (part === "music") return <MusicPicker p={p} update={update} custom={custom} setCustom={setCustom} />;

  return (
    <div className="space-y-7">
      <div>
        <h3 className="text-sm font-semibold">סגנון</h3>
        <p className="mt-0.5 text-xs text-ink-soft">אותם צבעים, תחושה אחרת. משתלב עם כל ערכת צבעים.</p>
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(Object.keys(STYLES) as StyleKey[]).map((k) => {
            const st = STYLES[k];
            const on = (p.style ?? "classic") === k;
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => update({ style: k })}
                  aria-pressed={on}
                  className={`w-full rounded-xl border p-2 text-start ${on ? "border-ink ring-1 ring-ink" : "border-rule-strong"}`}
                >
                  <StylePreview k={k} />
                  <span className="mt-1.5 block text-sm font-medium">{st.label}</span>
                  <span className="block text-[11px] leading-snug text-ink-soft">{st.desc}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-semibold">ערכת צבעים</h3>
        <p className="mt-0.5 text-xs text-ink-soft">כל אריח מראה את הערכה בבהיר (מימין) ובכהה (משמאל).</p>
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(PALETTES) as PaletteKey[]).map((k) => {
            const pal = PALETTES[k];
            const on = (p.palette ?? "default") === k;
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => update({ palette: k })}
                  className={`w-full rounded-xl border p-2 text-start ${on ? "border-ink ring-1 ring-ink" : "border-rule-strong"}`}
                  aria-pressed={on}
                >
                  <span className="flex h-14 overflow-hidden rounded-lg ring-1 ring-rule" aria-hidden>
                    <PaletteHalf c={pal.light} />
                    <PaletteHalf c={pal.dark} />
                  </span>
                  <span className="mt-1.5 flex items-center gap-1.5 text-sm">
                    {on && <Icon name="check" className="size-4" />}
                    {pal.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap gap-6">
        <div>
          <h3 className="text-sm font-semibold">בהיר / כהה</h3>
          <div className="seg mt-2">
            {(
              [
                ["system", "אוטומטי", "auto"],
                ["light", "בהיר", "sun"],
                ["dark", "כהה", "moon"],
              ] as const
            ).map(([v, l, icon]) => (
              <button key={v} type="button" onClick={() => update({ theme: v })} aria-pressed={(p.theme ?? "system") === v} className="seg-item">
                <Icon name={icon} className="size-4" />
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold">גודל טקסט</h3>
          <div className="seg mt-2">
            {(
              [
                ["sm", "קטן"],
                ["md", "רגיל"],
                ["lg", "גדול"],
                ["xl", "גדול מאוד"],
              ] as const
            ).map(([v, l], i) => (
              <button
                key={v}
                type="button"
                onClick={() => update({ size: v })}
                aria-pressed={(p.size ?? "md") === v}
                aria-label={`טקסט ${l}`}
                title={l}
                className="seg-item min-w-10"
                style={{ fontSize: 12 + i * 3 }}
              >
                א
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" checked={!!p.calm} onChange={(e) => update({ calm: e.target.checked })} className="size-5" />
          מצב רגוע (בלי אנימציות)
        </label>
      </div>

      <div>
        <h3 className="text-sm font-semibold">מה מופיע בעמוד ״היום״</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {TODAY_SECTIONS.map(([k, label]) => {
            const shown = !p.hidden?.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={shown}
                onClick={() => update({ hidden: shown ? [...(p.hidden ?? []), k] : (p.hidden ?? []).filter((x) => x !== k) })}
                className="chip"
              >
                {shown && <Icon name="check" className="size-4" />}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold">הלשוניות בסרגל התחתון בטלפון</h3>
        <p className="mt-0.5 text-xs text-ink-soft">בוחרים עד 4. כל השאר נמצאים תחת ״עוד״.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {TAB_CHOICES.map((t) => {
            const tabs = p.tabs?.length ? p.tabs : DEFAULT_TABS;
            const i = tabs.indexOf(t.href);
            const on = i >= 0;
            return (
              <button
                key={t.href}
                type="button"
                aria-pressed={on}
                disabled={!on && tabs.length >= 4}
                onClick={() => update({ tabs: on ? tabs.filter((h) => h !== t.href) : [...tabs, t.href] })}
                className="chip disabled:opacity-40"
              >
                {on ? `${i + 1}. ` : ""}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}

function MusicPicker({ p, update, custom, setCustom }: { p: LookPrefs; update: (patch: LookPrefs) => void; custom: string; setCustom: (v: string) => void }) {
  return (
      <div>
        <h3 className="text-sm font-semibold">מוזיקה לריכוז (Spotify)</h3>
        <p className="mt-0.5 text-xs text-ink-soft">מתנגנת בטיימר הריכוז. בטלפון היא נפתחת באפליקציה של Spotify.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => update({ music: null })} aria-pressed={!p.music} className="chip">
            בלי מוזיקה
          </button>
          {FOCUS_PLAYLISTS.map((pl) => (
            <button
              key={pl.id}
              type="button"
              onClick={() => update({ music: pl.id })}
              aria-pressed={p.music === pl.id}
              className="chip"
            >
              <Icon name="music" className="size-4" />
              {pl.name}
            </button>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const id = playlistId(custom);
            if (id) {
              update({ music: id });
              setCustom("");
            }
          }}
        >
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="או קישור לפלייליסט שלך"
            dir="ltr"
            className="min-w-0 flex-1 rounded-lg border border-rule-strong bg-surface px-3 py-2 text-sm"
          />
          <button disabled={!playlistId(custom)} className="btn">
            שמירה
          </button>
        </form>
        {p.music && !FOCUS_PLAYLISTS.some((x) => x.id === p.music) && <p className="mt-1 text-xs text-ink-soft">נבחר פלייליסט משלך.</p>}
      </div>
  );
}

/** A palette in miniature: page, a card with a line of text, and the highlighter. */
function PaletteHalf({ c }: { c: readonly string[] }) {
  const [bg, surface, ink, hl] = c;
  return (
    <span className="flex flex-1 items-center justify-center p-1.5" style={{ background: bg }}>
      <span className="block w-full rounded-md p-1.5" style={{ background: surface, border: `1px solid ${ink}22` }}>
        <span className="block h-1.5 w-3/4 rounded-full" style={{ background: ink }} />
        <span className="mt-1 block h-1.5 w-1/2 rounded-full" style={{ background: hl }} />
      </span>
    </span>
  );
}

/** The weekly study goal. Saved through saveProfile, which keeps profiles and study_prefs in step. */
export function WeeklyGoal({ initial }: { initial: ProfileInput }) {
  const [goal, setGoal] = useState(initial.weekly_goal_minutes ?? 0);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex flex-wrap items-center gap-3">
        יעד לימוד שבועי
        <select
          value={goal}
          onChange={(e) => {
            const v = Number(e.target.value);
            setGoal(v);
            setMsg(null);
            start(async () => {
              try {
                await saveProfile({ ...initial, weekly_goal_minutes: v || null });
                setMsg("נשמר");
              } catch (err) {
                setMsg(err instanceof Error ? err.message : "לא נשמר");
              }
            });
          }}
          className="rounded-lg border border-rule-strong bg-surface px-3 py-2"
        >
          <option value={0}>בלי יעד</option>
          {[5, 8, 10, 12, 15, 20, 25, 30].map((h) => (
            <option key={h} value={h * 60}>
              {h} שעות
            </option>
          ))}
        </select>
      </label>
      <span className="text-sm text-ink-soft" aria-live="polite">
        {pending ? "שומר…" : msg}
      </span>
    </div>
  );
}

/** Applies the account's saved look on this device (so it follows you between phone and computer). */
export function LookSync({ prefs }: { prefs: LookPrefs }) {
  useEffect(() => {
    if (prefs.palette || prefs.style || prefs.theme || prefs.size || prefs.calm) applyLook(prefs);
    try {
      if (prefs.music) localStorage.setItem("music", prefs.music);
      else localStorage.removeItem("music");
    } catch {}
  }, [prefs]);
  return null;
}

/** A tiny drawing of each style (drawn with inline styles, so all five show at once). */
function StylePreview({ k }: { k: StyleKey }) {
  const page: React.CSSProperties = { background: "var(--bg)" };
  const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--rule)", borderRadius: 6 };
  const title: React.CSSProperties = { fontFamily: "var(--font-secular)" };
  if (k === "soft") {
    Object.assign(card, { borderRadius: 12, border: "1px solid transparent", boxShadow: "0 6px 14px -8px rgb(0 0 0 / .35)" });
    Object.assign(title, { fontFamily: "'Varela Round'" });
  } else if (k === "bold") {
    Object.assign(card, { borderRadius: 2, border: "2px solid var(--ink)", boxShadow: "-3px 3px 0 var(--ink)" });
    Object.assign(title, { fontFamily: "'Rubik Variable'", fontWeight: 800 });
  } else if (k === "glass") {
    Object.assign(page, {
      background:
        "radial-gradient(60px 40px at 80% 10%, color-mix(in srgb, var(--c-blue) 45%, transparent), transparent), radial-gradient(60px 50px at 10% 90%, color-mix(in srgb, var(--highlight) 55%, transparent), transparent), var(--bg)",
    });
    Object.assign(card, { background: "color-mix(in srgb, var(--surface) 55%, transparent)", borderRadius: 10, backdropFilter: "blur(6px)" });
  } else if (k === "notebook") {
    Object.assign(page, {
      background:
        "linear-gradient(to left, transparent 10px, color-mix(in srgb, var(--c-rose) 50%, transparent) 10px 11px, transparent 11px), repeating-linear-gradient(to bottom, transparent 0 7px, color-mix(in srgb, var(--ink) 12%, transparent) 7px 8px), var(--bg)",
    });
    Object.assign(card, { borderRadius: 2, boxShadow: "0 4px 6px -5px rgb(0 0 0 / .4)" });
    Object.assign(title, { fontFamily: "'Frank Ruhl Libre'", fontWeight: 700, background: "linear-gradient(transparent 55%, var(--highlight) 55%)" });
  }
  return (
    <span className="block h-16 overflow-hidden rounded-lg p-2" style={page} aria-hidden>
      <span className="block h-full p-1.5" style={card}>
        <span className="text-[11px] leading-none" style={title}>
          היום
        </span>
        <span className="mt-1.5 block h-1.5 w-3/4 rounded-full" style={{ background: "var(--rule)" }} />
        <span className="mt-1 block h-1.5 w-1/2 rounded-full" style={{ background: "var(--ink)", opacity: 0.8 }} />
      </span>
    </span>
  );
}
