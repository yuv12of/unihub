"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { saveModules } from "@/app/act";
import { GOALS_BUILT, MODE_PRESETS, MODULE_LABELS, type ModeChoice, type ModuleKey, type Modules } from "@/lib/modules";

const SHOWN: ModuleKey[] = (["study", "goals", "hobbies"] as ModuleKey[]).filter((k) => k !== "goals" || GOALS_BUILT);

/** Settings: one switch per module. Turning one off hides its pages; the data stays. */
export function ModuleSwitches({ initial }: { initial: Modules }) {
  const [m, setM] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const flip = (k: ModuleKey) => {
    const next = { ...m, [k]: !m[k] };
    setM(next);
    setError("");
    start(async () => {
      try {
        await saveModules({ [k]: next[k] });
      } catch (e) {
        setM(m);
        setError(e instanceof Error ? e.message : "לא נשמר, נסו שוב");
      }
    });
  };
  return (
    <div>
      <ul className="divide-y divide-rule">
        {SHOWN.map((k) => (
          <li key={k} className="flex items-center gap-4 py-3">
            <div className="min-w-0 flex-1">
              <p id={`mod-${k}`} className="font-medium">
                {MODULE_LABELS[k].label}
              </p>
              <p className="text-sm text-ink-soft">{MODULE_LABELS[k].desc}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={m[k]}
              aria-labelledby={`mod-${k}`}
              disabled={pending}
              onClick={() => flip(k)}
              className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${m[k] ? "border-transparent bg-accent" : "border-rule-strong bg-bg"}`}
            >
              <span className={`absolute top-1/2 size-5 -translate-y-1/2 rounded-full transition-[inset-inline-start] ${m[k] ? "start-6 bg-on-accent" : "start-1 bg-rule-strong"}`} />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-soft">כיבוי רק מסתיר. שום דבר לא נמחק, והפעלה מחזירה הכול.</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

const CHOICES: { key: ModeChoice; label: string; desc: string }[] = [
  { key: "study", label: "לימודים", desc: "קורסים, מטלות, בחינות ותוכנית לימוד" },
  { key: "life", label: "מטרות וחיים", desc: "שגרות, לוח שנה, תחביבים ומטרות אישיות" },
  { key: "both", label: "גם וגם", desc: "הכול ביחד" },
];

/** First visit: one question that decides what the app shows. Changeable in Settings. */
export function ModePicker() {
  const [picked, setPicked] = useState<ModeChoice | null>(null);
  const [error, setError] = useState("");
  const [, start] = useTransition();
  const choose = (key: ModeChoice) => {
    setPicked(key);
    setError("");
    start(async () => {
      try {
        await saveModules(MODE_PRESETS[key]);
      } catch (e) {
        setPicked(null);
        setError(e instanceof Error ? e.message : "לא נשמר, נסו שוב");
      }
    });
  };
  return (
    <section className="panel p-5" aria-labelledby="mode-title">
      <h2 id="mode-title" className="section-title">
        מה מביא אותך לכאן?
      </h2>
      <p className="text-sm text-ink-soft">לפי זה נבחר מה להציג. אפשר לשנות בכל רגע בהגדרות.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {CHOICES.map((c) => (
          <button
            key={c.key}
            type="button"
            disabled={picked !== null}
            aria-pressed={picked === c.key}
            onClick={() => choose(c.key)}
            className={`min-h-16 rounded-xl border px-4 py-3 text-start transition-colors ${picked === c.key ? "accent-surface border-transparent" : "border-rule-strong hover:border-ink"} disabled:cursor-default`}
          >
            <span className="block font-medium">{c.label}</span>
            <span className={`block text-xs ${picked === c.key ? "" : "text-ink-soft"}`}>{c.desc}</span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
    </section>
  );
}

/** Shown on Today after a redirect from a page of a module that is off (?off=study). */
export function ModuleOffNote() {
  const off = useSearchParams().get("off") as ModuleKey | null;
  if (!off || !(off in MODULE_LABELS)) return null;
  return (
    <p className="panel flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm" role="status">
      <span className="flex-1">העמוד הזה שייך ל״{MODULE_LABELS[off].label}״, שכבוי אצלך.</span>
      <Link href="/settings#modules" className="btn-ghost">
        להפעלה בהגדרות
      </Link>
    </p>
  );
}
