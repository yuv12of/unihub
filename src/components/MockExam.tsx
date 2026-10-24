"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { finishMock, startMock } from "@/app/act";
import { Icon } from "@/components/Icon";
import { duration } from "@/lib/time";

interface Saved {
  attemptId: string | null;
  startedAt: number;
  count: number;
  /** ms spent per question (index 0 = question 1) */
  spent: number[];
  current: number;
  since: number;
}

const WARN = [30, 10, 5];
const pad = (n: number) => String(n).padStart(2, "0");
const clockOf = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.35);
  } catch {}
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {}
}

/** A past exam under exam conditions: full-screen countdown, warnings, time per question, then self-grading. */
export function MockExam({
  examId,
  code,
  label,
  url,
  minutes,
  questions,
}: {
  examId: string;
  code: string;
  label: string;
  url: string | null;
  minutes: number;
  questions: number;
}) {
  const key = `mock:${examId}`;
  const [phase, setPhase] = useState<"ready" | "running" | "grading" | "done">("ready");
  const [count, setCount] = useState(String(questions || 5));
  const [s, setS] = useState<Saved | null>(null);
  const [now, setNow] = useState(0);
  const [warned, setWarned] = useState<number[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [scores, setScores] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ avg: number; stuck: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const boot = useRef(false);

  // Resume an attempt that was running when the page closed.
  useEffect(() => {
    if (boot.current) return;
    boot.current = true;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw) as Saved;
        /* eslint-disable react-hooks/set-state-in-effect -- restoring a saved attempt once after mount */
        setS(saved);
        setScores(Array(saved.count).fill(""));
        setPhase(Date.now() - saved.startedAt < minutes * 60_000 + 6 * 3600_000 ? "running" : "grading");
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {}
  }, [key, minutes]);

  const persist = (v: Saved | null) => {
    setS(v);
    try {
      if (v) localStorage.setItem(key, JSON.stringify(v));
      else localStorage.removeItem(key);
    } catch {}
  };

  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [phase]);

  const left = s && now ? s.startedAt + minutes * 60_000 - now : minutes * 60_000;

  useEffect(() => {
    if (phase !== "running" || !s || !now) return;
    const minLeft = left / 60_000;
    const due = WARN.find((w) => minLeft <= w && !warned.includes(w) && minutes > w);
    if (due) {
      /* eslint-disable react-hooks/set-state-in-effect -- warnings fire from the ticking clock */
      setWarned((x) => [...x, ...WARN.filter((w) => w >= due)]);
      setBanner(`נשארו ${due} דקות`);
      /* eslint-enable react-hooks/set-state-in-effect */
      beep();
      setTimeout(() => setBanner(null), 8000);
    }
    if (left <= 0) {
      beep();
      stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  const switchTo = (q: number) => {
    if (!s) return;
    const t = Date.now();
    const spent = [...s.spent];
    spent[s.current] += t - s.since;
    persist({ ...s, spent, current: q, since: t });
  };

  function stop() {
    if (!s) return;
    const t = Date.now();
    const spent = [...s.spent];
    spent[s.current] += t - s.since;
    persist({ ...s, spent, since: t });
    setScores(Array(s.count).fill(""));
    setPhase("grading");
    try {
      if (document.fullscreenElement) document.exitFullscreen();
    } catch {}
  }

  async function begin() {
    setErr(null);
    setBusy(true);
    const n = Math.max(1, Math.min(30, Number(count) || 5));
    let attemptId: string | null = null;
    let startedAt = Date.now();
    try {
      const r = await startMock(examId);
      attemptId = r.id;
      startedAt = Date.parse(r.started_at) || startedAt;
    } catch (e) {
      setErr(`${e instanceof Error ? e.message : "לא התחיל"}. אפשר לתרגל, אבל התוצאה לא תישמר.`);
    }
    setBusy(false);
    persist({ attemptId, startedAt, count: n, spent: Array(n).fill(0), current: 0, since: Date.now() });
    setNow(Date.now());
    setPhase("running");
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {}
  }

  async function save() {
    if (!s) return;
    const list = s.spent.map((ms, i) => ({ q: i + 1, score: Math.max(0, Math.min(100, Number(scores[i]) || 0)), minutes: Math.round(ms / 60_000) }));
    const avg = Math.round(list.reduce((t, x) => t + x.score, 0) / list.length);
    setBusy(true);
    setErr(null);
    try {
      const r = s.attemptId ? await finishMock({ attemptId: s.attemptId, scores: list }) : { stuck: 0 };
      setResult({ avg, stuck: r.stuck });
      persist(null);
      setPhase("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "לא נשמר");
    }
    setBusy(false);
  }

  if (phase === "ready")
    return (
      <div className="panel mx-auto max-w-xl p-6">
        <p className="text-sm text-ink-soft">בחינה לדוגמה</p>
        <h1 className="font-display text-3xl">{label}</h1>
        <ul className="mt-4 space-y-1.5 text-[15px]">
          <li>משך: {duration(minutes)}, כמו בבחינה האמיתית.</li>
          <li>תזכורות כשנשארות 30, 10 ו־5 דקות.</li>
          <li>לוחצים על מספר השאלה שעובדים עליה, כדי לדעת כמה זמן לקחה כל שאלה.</li>
          <li>בסוף בודקים לבד מול הפתרון, ושאלות מתחת ל־60% נכנסות לנקודות לתרגול.</li>
        </ul>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 underline decoration-rule underline-offset-4">
            <Icon name="clip" className="size-4" />
            לפתוח את הבחינה (PDF)
          </a>
        )}
        <label className="mt-4 flex items-center gap-2 text-sm">
          מספר שאלות:
          <input value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" className="w-16 rounded-lg border border-rule bg-surface px-2 py-1.5 text-center" />
        </label>
        <p className="mt-3 text-xs text-ink-soft">כדאי להעביר את הטלפון למצב ״נא לא להפריע״.</p>
        <div className="mt-5 flex items-center gap-3">
          <button onClick={begin} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-5 py-2.5 text-bg disabled:opacity-50">
            <Icon name="timer" className="size-5" />
            להתחיל
          </button>
          <Link href={`/courses/${code}#exams`} className="text-sm text-ink-soft">
            חזרה לקורס
          </Link>
        </div>
        {err && <p className="mt-3 text-sm hl">{err}</p>}
      </div>
    );

  if (phase === "running" && s) {
    const cur = s.spent[s.current] + (now ? now - s.since : 0);
    const end = new Date(s.startedAt + minutes * 60_000);
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 overflow-y-auto bg-bg p-6 text-center">
        {banner && <p className="hl rounded-lg px-4 py-2 text-lg font-semibold" role="alert">{banner}</p>}
        <div>
          <p className="text-sm text-ink-soft">{label}</p>
          <p className={`font-display text-7xl tabular-nums sm:text-8xl ${left < 5 * 60_000 ? "hl" : ""}`} dir="ltr" aria-live="off">
            {clockOf(left)}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            מסתיים ב־<bdi dir="ltr">{pad(end.getHours())}:{pad(end.getMinutes())}</bdi>
          </p>
        </div>
        <div>
          <p className="text-sm text-ink-soft">עובד/ת על שאלה</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {s.spent.map((ms, i) => (
              <button
                key={i}
                type="button"
                onClick={() => switchTo(i)}
                aria-pressed={s.current === i}
                className={`grid size-14 place-items-center rounded-xl border text-lg tabular-nums ${s.current === i ? "border-ink bg-ink text-bg" : "border-rule"}`}
              >
                <span>
                  {i + 1}
                  <span className="block text-[10px] opacity-70">{Math.round((s.current === i ? cur : ms) / 60_000)} דק׳</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm("לסיים את הבחינה ולעבור לבדיקה?")) stop();
          }}
          className="rounded-lg border border-rule px-5 py-2.5"
        >
          סיימתי
        </button>
      </div>
    );
  }

  if (phase === "grading" && s)
    return (
      <div className="panel mx-auto max-w-xl p-6">
        <h1 className="font-display text-3xl">בדיקה עצמית</h1>
        <p className="mt-1 text-sm text-ink-soft">כמה אחוזים מהשאלה הייתם מקבלים לפי הפתרון? מתחת ל־60% השאלה נכנסת לנקודות לתרגול.</p>
        <ol className="mt-4 divide-y divide-rule border-y border-rule">
          {s.spent.map((ms, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="w-20 font-medium">שאלה {i + 1}</span>
              <span className="w-16 text-xs text-ink-soft">{duration(Math.round(ms / 60_000))}</span>
              <span className="flex gap-1">
                {[0, 50, 75, 100].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setScores((x) => x.map((y, j) => (j === i ? String(v) : y)))}
                    aria-pressed={scores[i] === String(v)}
                    className="rounded-full border border-rule px-2.5 py-1 text-xs tabular-nums aria-pressed:bg-ink aria-pressed:text-bg"
                  >
                    {v}
                  </button>
                ))}
              </span>
              <input
                value={scores[i] ?? ""}
                onChange={(e) => setScores((x) => x.map((y, j) => (j === i ? e.target.value.replace(/\D/g, "").slice(0, 3) : y)))}
                inputMode="numeric"
                placeholder="%"
                className="w-16 rounded-lg border border-rule bg-surface px-2 py-1 text-center tabular-nums"
                aria-label={`ציון שאלה ${i + 1} באחוזים`}
              />
            </li>
          ))}
        </ol>
        <button onClick={save} disabled={busy || scores.some((x) => x === "")} className="mt-4 rounded-lg bg-ink px-5 py-2.5 text-bg disabled:opacity-50">
          שמירה
        </button>
        {!s.attemptId && <p className="mt-2 text-xs text-ink-soft">הניסיון הזה לא נשמר במערכת.</p>}
        {err && <p className="mt-3 text-sm hl">{err}</p>}
      </div>
    );

  return (
    <div className="panel mx-auto max-w-xl p-6 text-center">
      <h1 className="font-display text-3xl">כל הכבוד על הישיבה</h1>
      {result && (
        <p className="mt-3 text-lg">
          ציון משוער: <b className="tabular-nums">{result.avg}</b>
          {result.stuck ? <span className="block text-sm text-ink-soft">{result.stuck === 1 ? "שאלה אחת נוספה" : `${result.stuck} שאלות נוספו`} לנקודות לתרגול.</span> : null}
        </p>
      )}
      <Link href={`/courses/${code}#exams`} className="mt-5 inline-block rounded-lg bg-ink px-5 py-2.5 text-bg">
        חזרה לקורס
      </Link>
    </div>
  );
}
