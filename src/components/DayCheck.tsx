"use client";

import { useState, useTransition } from "react";
import { saveDayCheck, setRhythmOff } from "@/app/act";
import { Icon } from "@/components/Icon";
import { BANDS, BLOCKERS, ENERGY, MIN_CHECKS, bandLabel, type Band, type DayCheck as Check, type Rhythm } from "@/lib/rhythm";

/**
 * The 20-second end-of-day check: energy, what got in the way, when focus was best. Saved, it shows
 * what Unihub learned and what it changes in the plan.
 */
export function DayCheck({
  date,
  dateLabel,
  existing,
  rhythm: initialRhythm,
  names,
  tips,
}: {
  date: string;
  /** "היום" or "אתמול" */
  dateLabel: string;
  existing: Check | null;
  rhythm: Rhythm | null;
  /** course code -> short name */
  names: Record<string, string>;
  /** the most frequent blockers of the last two weeks (n = times) */
  tips: { id: string; label: string; tip: string; n: number }[];
}) {
  const [open, setOpen] = useState(!existing);
  const [energy, setEnergy] = useState<number | null>(existing?.energy ?? null);
  const [blockers, setBlockers] = useState<string[]>(existing?.blockers ?? []);
  const [band, setBand] = useState<Band | null>(existing?.focus_band ?? null);
  const [saved, setSaved] = useState<Check | null>(existing);
  const [rhythm, setRhythm] = useState<Rhythm | null>(initialRhythm);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setBlockers((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));
  const save = () =>
    start(async () => {
      setError(null);
      try {
        const r = await saveDayCheck({ date, energy: energy!, blockers, focusBand: band });
        setRhythm(r.rhythm);
        setSaved({ date, energy: energy!, blockers, focus_band: band });
        setOpen(false);
      } catch (e) {
        setError((e as Error).message || "השמירה נכשלה");
      }
    });
  const flipOff = () =>
    start(async () => {
      try {
        const r = await setRhythmOff(!rhythm?.off);
        setRhythm(r.rhythm);
      } catch (e) {
        setError((e as Error).message || "השמירה נכשלה");
      }
    });

  if (!open && saved) {
    const hardest = rhythm?.hard[0] ? names[rhythm.hard[0]] ?? rhythm.hard[0] : null;
    const tip = tips.find((t) => saved.blockers.includes(t.id)) ?? null;
    return (
      <div className="panel p-4 text-sm">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-bg text-ink-soft">
            <Icon name="check" className="size-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <p>
              <b>נשמר.</b> {dateLabel}: {ENERGY[saved.energy - 1].label}
              {saved.focus_band ? `, הכי מרוכז ב${bandLabel(saved.focus_band)}` : ""}.
            </p>
            {rhythm?.best && hardest ? (
              <p className="text-ink-soft">
                {rhythm.off ? (
                  <>למדתי שהשעות הטובות שלך הן ב{bandLabel(rhythm.best)}, אבל ההזזה כבויה.</>
                ) : (
                  <>
                    השעות הטובות שלך הן ב{bandLabel(rhythm.best)}, אז מעכשיו הלימוד ב{hardest} עובר לשם כשיש מפגש שם.
                  </>
                )}{" "}
                <button type="button" onClick={flipOff} disabled={pending} className="underline decoration-rule underline-offset-4 hover:text-ink">
                  {rhythm.off ? "להפעיל" : "לא להזיז"}
                </button>
              </p>
            ) : (
              <p className="text-ink-soft">
                {rhythm && rhythm.n >= MIN_CHECKS
                  ? "עוד אין שעה אחת שבולטת. ממשיכים ללמוד מהערבים הבאים."
                  : `עוד ${Math.max(1, MIN_CHECKS - (rhythm?.n ?? 0))} ערבים עם "מתי הייתי מרוכז", ו־Unihub יתחיל להעביר את הלימוד הקשה לשעות הטובות שלך.`}
              </p>
            )}
            {tip && tip.n >= 2 && (
              <p className="text-ink-soft">
                {tip.label}: {tip.n} פעמים בשבועיים האחרונים. {tip.tip}
              </p>
            )}
          </div>
          <button type="button" onClick={() => setOpen(true)} className="btn-ghost shrink-0 rounded-lg px-2 text-sm">
            עריכה
          </button>
        </div>
        {error && <p className="mt-2 text-bad">{error}</p>}
      </div>
    );
  }

  return (
    <section className={`panel p-4 ${pending ? "opacity-70" : ""}`} aria-labelledby="daycheck-title">
      <h2 id="daycheck-title" className="font-medium">
        איך היה {dateLabel === "היום" ? "היום" : "אתמול"}?
      </h2>
      <p className="text-sm text-ink-soft">20 שניות. מזה Unihub לומד מתי הכי טוב לך ללמוד.</p>

      <fieldset className="mt-3">
        <legend className="sr-only">אנרגיה</legend>
        <div className="grid grid-cols-5 gap-1.5">
          {ENERGY.map((e) => (
            <button
              key={e.n}
              type="button"
              aria-pressed={energy === e.n}
              onClick={() => setEnergy(e.n)}
              className="chip flex-col justify-center !gap-0 px-1 py-1.5 leading-tight"
            >
              <span className="text-base font-semibold tabular-nums">{e.n}</span>
              <span className="text-[11px]">{e.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {energy != null && (
        <>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">מה הפריע? <span className="font-normal text-ink-soft">(אפשר לדלג)</span></legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {BLOCKERS.map((b) => (
                <button key={b.id} type="button" aria-pressed={blockers.includes(b.id)} onClick={() => toggle(b.id)} className="chip text-sm">
                  {b.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">מתי היית הכי מרוכז?</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {BANDS.map((b) => (
                <button key={b.id} type="button" aria-pressed={band === b.id} onClick={() => setBand(band === b.id ? null : b.id)} className="chip text-sm">
                  {b.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={save} disabled={pending} className="btn-primary rounded-lg px-4">
              שמירה
            </button>
            {saved && (
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost rounded-lg px-2 text-sm">
                ביטול
              </button>
            )}
          </div>
        </>
      )}
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </section>
  );
}
