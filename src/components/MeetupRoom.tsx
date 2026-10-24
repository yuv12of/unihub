"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { meetupQuestionsToStuck, saveMeetupLinks, saveMeetupNote, setMeetupAsked, setMeetupAttended } from "@/app/act";
import { Icon } from "@/components/Icon";
import { MathText } from "@/components/MathText";
import { ReadChips } from "@/components/ReadChips";
import { MARK_EXAM, MARK_Q, MATH_KEYS, MEETUP_LEAD, examLines, questionLines, stamp } from "@/lib/meetup";
import type { ReadLink } from "@/lib/readings";
import { duration, range } from "@/lib/time";

export interface MeetupData {
  code: string;
  date: string;
  name: string;
  short: string;
  color: string;
  start: string | null;
  end: string | null;
  /** this is meetup N of total */
  number: number | null;
  total: number | null;
  nextDate: string | null;
  liveUrl: string | null;
  recordingsUrl: string | null;
  group: string | null;
  note: string;
  attended: boolean | null;
  asked: string[];
  prevDate: string | null;
  prevStars: string[];
  questions: { id: string; topic: string; detail: string | null; href: string | null }[];
  reading: { label: string; links: ReadLink[] } | null;
  today: string;
  nowMin: number;
  editable: boolean;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const shortDate = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });

/** Israel wall-clock minutes, ticking every 20 s (starts from the server's value: no hydration mismatch). */
function useIsraelMinutes(initial: number) {
  const [m, setM] = useState(initial);
  useEffect(() => {
    const read = () => {
      const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
      const h = Number(p.find((x) => x.type === "hour")!.value) % 24;
      setM(h * 60 + Number(p.find((x) => x.type === "minute")!.value));
    };
    const t = setInterval(read, 20_000);
    return () => clearInterval(t);
  }, []);
  return m;
}

export function MeetupRoom({ data }: { data: MeetupData }) {
  const now = useIsraelMinutes(data.nowMin);
  const [body, setBody] = useState(data.note);
  const isToday = data.date === data.today;
  const isPast = data.date < data.today;
  const start = data.start ? toMin(data.start) : null;
  const end = data.end ? toMin(data.end) : start != null ? start + 120 : null;
  const phase: "future" | "soon" | "live" | "after" =
    isPast || (isToday && end != null && now >= end) ? "after" : isToday && start != null && now >= start ? "live" : isToday && start != null && now >= start - MEETUP_LEAD ? "soon" : "future";

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/courses/${data.code}`} className="text-sm text-ink-soft hover:text-ink">
        {data.name}
      </Link>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <h1 className="font-display text-3xl sm:text-4xl">
          מצב מפגש{data.number ? ` ${data.number}` : ""}
          {data.total ? <span className="text-ink-soft"> מתוך {data.total}</span> : null}
        </h1>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-soft">
        <span className="size-2.5 rounded-full" style={{ background: data.color }} aria-hidden />
        <span>{data.short}</span>
        <span aria-hidden>·</span>
        <span>
          {shortDate(data.date)} {data.start ? range(data.start, data.end) : ""}
        </span>
        {data.group && (
          <>
            <span aria-hidden>·</span>
            <span>{data.group}</span>
          </>
        )}
      </p>

      <StatusBar data={data} phase={phase} now={now} start={start} end={end} />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {phase === "after" && <WrapUp data={data} body={body} />}
          <Notes data={data} now={now} live={phase === "live"} body={body} setBody={setBody} />
        </div>
        <aside className="space-y-6">
          <Questions data={data} />
          {data.reading && (
            <section className="panel p-4">
              <h2 className="section-title">לקראת המפגש</h2>
              <p className="mt-1 text-sm text-ink-soft">{data.reading.label}</p>
              <ReadChips links={data.reading.links} className="mt-2" />
            </section>
          )}
          {data.prevStars.length > 0 && data.prevDate && (
            <section className="panel p-4">
              <h2 className="section-title">חשוב לבחינה, מהמפגש הקודם</h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                {data.prevStars.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden>{MARK_EXAM}</span>
                    <MathText text={s} />
                  </li>
                ))}
              </ul>
              <Link href={`/meetup/${data.code}/${data.prevDate}`} className="mt-2 inline-block text-xs text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
                לסיכום של {shortDate(data.prevDate)}
              </Link>
            </section>
          )}
          <section className="panel space-y-2 p-4 text-sm">
            {data.recordingsUrl && (
              <a href={data.recordingsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline">
                <Icon name="camera" className="size-4 text-ink-soft" />
                הקלטות המפגשים באופל
              </a>
            )}
            {data.nextDate && (
              <Link href={`/meetup/${data.code}/${data.nextDate}`} className="flex items-center gap-2 hover:underline">
                <Icon name="calendar" className="size-4 text-ink-soft" />
                המפגש הבא: {shortDate(data.nextDate)}
              </Link>
            )}
            <p className="text-xs text-ink-soft">בזמן מפגש חי, התראות Unihub אחרות שותקות.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function StatusBar({ data, phase, now, start, end }: { data: MeetupData; phase: string; now: number; start: number | null; end: number | null }) {
  const join = data.liveUrl ? (
    <a
      href={data.liveUrl}
      target="_blank"
      rel="noreferrer"
      className={
        phase === "after" || phase === "future"
          ? "btn btn-lg rounded-xl px-5"
          : "inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--on-accent)] px-5 font-semibold text-[var(--accent-bg)]"
      }
    >
      <Icon name="camera" className="size-5" />
      כניסה למפגש בזום
    </a>
  ) : null;
  const total = start != null && end != null ? end - start : null;
  const elapsed = start != null ? Math.max(0, now - start) : 0;
  return (
    <section className={`mt-5 rounded-2xl p-5 ${phase === "live" || phase === "soon" ? "accent-surface" : "panel"}`}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          {phase === "soon" && start != null && (
            <>
              <p className="text-sm opacity-80">מתחיל בעוד</p>
              <p className="font-display text-3xl tabular-nums">{duration(start - now)}</p>
            </>
          )}
          {phase === "live" && total != null && (
            <>
              <p className="text-sm opacity-80">עכשיו במפגש</p>
              <p className="font-display text-3xl tabular-nums">
                {stamp(data.start!, now).slice(1, -1)} <span className="text-base opacity-80">מתוך {duration(total)}</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-current/20" aria-hidden>
                <div className="h-full rounded-full bg-current" style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} />
              </div>
            </>
          )}
          {phase === "future" && <p>המפגש עוד לא התחיל. אפשר כבר לרשום שאלות ולקרוא לקראתו.</p>}
          {phase === "after" && <p>המפגש הסתיים. הסיכום שלך נשמר כאן ובעמוד הקורס.</p>}
        </div>
        {join}
      </div>
      {!data.liveUrl && data.editable && <LinkForm code={data.code} />}
    </section>
  );
}

function LinkForm({ code }: { code: string }) {
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="mt-4 flex flex-wrap items-center gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            await saveMeetupLinks(code, { live_url: url });
            setMsg("נשמר");
          } catch (err) {
            setMsg((err as Error).message);
          }
        });
      }}
    >
      <label htmlFor="live-url" className="w-full text-ink-soft">
        קישור למפגש החי (באופל: &quot;מפגש חי&quot; ← &quot;כניסה למפגש החי&quot;, להעתיק את הקישור)
      </label>
      <input id="live-url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://opal.openu.ac.il/local/ouil_zoom/…" className="min-w-0 flex-1 rounded-lg border border-rule-strong bg-surface px-3 py-2" />
      <button type="submit" disabled={pending || !url} className="btn rounded-lg px-3">
        שמירה
      </button>
      {msg && <span className="text-ink-soft">{msg}</span>}
    </form>
  );
}

/** Live notes: autosaved a second after typing stops (and kept in the browser if the network drops). */
function Notes({ data, now, live, body, setBody }: { data: MeetupData; now: number; live: boolean; body: string; setBody: (s: string) => void }) {
  const key = `meetup:${data.code}:${data.date}`;
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(data.note);

  // a newer draft left in this browser (saved offline) wins over the server copy once
  useEffect(() => {
    try {
      const draft = localStorage.getItem(key);
      if (draft && draft !== data.note && draft.length >= data.note.length) {
        setBody(draft);
      }
    } catch {}
  }, [key, data.note, setBody]);

  const save = useCallback(
    async (text: string) => {
      if (!data.editable || text === last.current) return;
      setStatus("saving");
      try {
        const r = await saveMeetupNote(data.code, data.date, text);
        last.current = text;
        setSavedAt(new Date(r.savedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }));
        setStatus("saved");
        try {
          localStorage.removeItem(key);
        } catch {}
      } catch {
        setStatus("error");
      }
    },
    [data.code, data.date, data.editable, key],
  );

  const change = (text: string) => {
    setBody(text);
    try {
      localStorage.setItem(key, text);
    } catch {}
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(text), 1000);
  };

  // save on leaving the page
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden" && ref.current) void save(ref.current.value);
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [save]);

  /** Insert at the cursor; `line` = start a new line with it. */
  const insert = (text: string, line = false) => {
    const el = ref.current;
    if (!el) return;
    const a = el.selectionStart ?? body.length;
    const b = el.selectionEnd ?? body.length;
    const before = body.slice(0, a);
    const lead = line && before.length && !before.endsWith("\n") ? "\n" : "";
    const piece = lead + text;
    const next = before + piece + body.slice(b);
    change(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + piece.length, a + piece.length);
    });
  };

  const [math, setMath] = useState(false);
  const qs = questionLines(body).length;
  const stars = examLines(body).length;

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-rule p-2">
        {live && data.start && (
          <button type="button" onClick={() => insert(`${stamp(data.start!, now)} `, true)} className="chip text-sm" title="סימון זמן: אותו סימון מוצא את המקום בהקלטה">
            <Icon name="timer" className="size-4" />
            זמן
          </button>
        )}
        <button type="button" onClick={() => insert(`${MARK_Q} `, true)} className="chip text-sm">
          {MARK_Q} לא הבנתי
        </button>
        <button type="button" onClick={() => insert(`${MARK_EXAM} `, true)} className="chip text-sm">
          {MARK_EXAM} חשוב לבחינה
        </button>
        <button type="button" onClick={() => setMath(!math)} aria-pressed={math} className="chip text-sm md:hidden">
          ∑ סימנים
        </button>
        <span className="mx-1 hidden h-6 w-px bg-rule md:block" aria-hidden />
        <div className={`${math ? "flex" : "hidden md:flex"} w-full flex-wrap gap-1 md:w-auto`} dir="ltr" aria-label="סימנים">
          {MATH_KEYS.map((k) => (
            <button key={k} type="button" onClick={() => insert(k)} className="grid size-9 place-items-center rounded-md text-base hover:bg-bg" aria-label={k}>
              {k}
            </button>
          ))}
        </div>
      </div>
      <label htmlFor="meetup-notes" className="sr-only">
        הערות מהמפגש
      </label>
      <textarea
        id="meetup-notes"
        ref={ref}
        value={body}
        onChange={(e) => change(e.target.value)}
        onBlur={(e) => save(e.target.value)}
        dir="auto"
        rows={16}
        readOnly={!data.editable}
        placeholder={`מה המנחה הדגיש, דוגמאות, טריקים.\n${MARK_Q} בתחילת שורה = משהו שלא הבנתי (יהפוך לנקודת תקיעה בסוף)\n${MARK_EXAM} בתחילת שורה = חשוב לבחינה (יופיע במפגש הבא)`}
        className="block min-h-[22rem] w-full resize-y bg-transparent p-4 leading-relaxed outline-none"
      />
      <div className="flex flex-wrap items-center gap-3 border-t border-rule px-4 py-2 text-xs text-ink-soft">
        <span>
          {qs ? `${qs} ${MARK_Q}` : ""} {stars ? `${stars} ${MARK_EXAM}` : ""}
        </span>
        <span className="ms-auto" aria-live="polite">
          {status === "saving" ? "שומר…" : status === "saved" && savedAt ? `נשמר ${savedAt}` : status === "error" ? "לא נשמר (שמור בדפדפן, ננסה שוב)" : ""}
        </span>
      </div>
    </section>
  );
}

/** Prepared questions (open stuck points of the course): tick what got asked. */
function Questions({ data }: { data: MeetupData }) {
  const [asked, setAsked] = useState<string[]>(data.asked);
  const [, start] = useTransition();
  if (!data.questions.length)
    return (
      <section className="panel p-4 text-sm">
        <h2 className="section-title">שאלות למפגש</h2>
        <p className="mt-1 text-ink-soft">אין נקודות תקיעה פתוחות בקורס. שאלה שעולה עכשיו: שורה שמתחילה ב־{MARK_Q} בהערות.</p>
      </section>
    );
  const flip = (id: string) => {
    const next = asked.includes(id) ? asked.filter((x) => x !== id) : [...asked, id];
    setAsked(next);
    if (data.editable) start(async () => void (await setMeetupAsked(data.code, data.date, next).catch(() => setAsked(asked))));
  };
  return (
    <section className="panel p-4">
      <h2 className="section-title">שאלות למפגש</h2>
      <p className="mt-1 text-xs text-ink-soft">נקודות התקיעה הפתוחות בקורס. לסמן מה נשאל.</p>
      <ul className="mt-3 space-y-2">
        {data.questions.map((q) => (
          <li key={q.id}>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input type="checkbox" checked={asked.includes(q.id)} onChange={() => flip(q.id)} className="mt-0.5 size-5 shrink-0 accent-current" />
              <span className={asked.includes(q.id) ? "text-ink-soft line-through decoration-rule-strong" : ""}>
                <MathText text={q.topic} />
                {q.detail && <span className="block text-xs text-ink-soft">{q.detail}</span>}
                {q.href && (
                  <Link href={q.href} className="text-xs text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
                    בספר
                  </Link>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** After the meetup: was I there, what wasn't clear, the recording if I missed it. */
function WrapUp({ data, body }: { data: MeetupData; body: string }) {
  const [attended, setAttended] = useState<boolean | null>(data.attended);
  const [added, setAdded] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const qs = questionLines(body);
  const mark = (v: boolean) => {
    setAttended(v);
    start(async () => {
      try {
        await setMeetupAttended(data.code, data.date, v);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  };
  return (
    <section className={`panel p-4 ${pending ? "opacity-70" : ""}`}>
      <h2 className="section-title">סיכום המפגש</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span>הייתי במפגש?</span>
        <button type="button" aria-pressed={attended === true} onClick={() => mark(true)} className="chip">
          כן
        </button>
        <button type="button" aria-pressed={attended === false} onClick={() => mark(false)} className="chip">
          פספסתי
        </button>
      </div>
      {attended === false && (
        <p className="mt-3 text-sm">
          ההקלטה עולה לאתר הקורס בדרך כלל תוך יום-יומיים.{" "}
          {data.recordingsUrl && (
            <a href={data.recordingsUrl} target="_blank" rel="noreferrer" className="underline decoration-rule underline-offset-4">
              להקלטות באופל
            </a>
          )}
        </p>
      )}
      {qs.length > 0 && data.editable && (
        <div className="mt-4 rounded-lg bg-bg p-3 text-sm">
          <p>
            {qs.length === 1 ? "שורה אחת" : `${qs.length} שורות`} עם {MARK_Q} בהערות.
            {added == null ? " להפוך אותן לנקודות תקיעה? התוכנית תיתן לקורס יותר זמן, והן יופיעו כשאלות למנחה." : added ? ` נוספו ${added} נקודות תקיעה.` : " כבר קיימות."}
          </p>
          {added == null && (
            <button
              type="button"
              className="btn mt-2 rounded-lg px-3"
              onClick={() =>
                start(async () => {
                  try {
                    const r = await meetupQuestionsToStuck(data.code, data.date, qs);
                    setAdded(r.added);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                })
              }
            >
              להוסיף {qs.length === 1 ? "נקודת תקיעה" : `${qs.length} נקודות תקיעה`}
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </section>
  );
}
