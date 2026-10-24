"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { recordAttempt } from "@/app/act";
import { newSeed, parseIntList, sameList } from "@/lib/drills/rng";
import { Frac } from "@/lib/drills/fraction";
import { bstFrom, genBstDrill, genBuildHeapDrill, genChainDrill, genHeapDrill, genProbeDrill, type ListStep } from "@/lib/drills/ds";
import { det, genDetDrill } from "@/lib/drills/linalg";
import { checkDeriv, checkLimit, genDerivDrill, genLimitDrill, limitText, pretty } from "@/lib/drills/calc";
import { ArrayRow, MatrixView, MiniKeys, TreeSvg, Verdict, field, heapTree } from "@/components/practice/DrillBits";
import { RrefDrill } from "@/components/practice/RrefDrill";

export type DrillId = "heap" | "build" | "bst" | "chain" | "probe" | "rref" | "det" | "deriv" | "limit";

export const DRILL_SETS: { code: string; subject: string; drills: { id: DrillId; title: string; blurb: string }[] }[] = [
  {
    code: "20407",
    subject: "מבני נתונים",
    drills: [
      { id: "heap", title: "ערימת מקסימום", blurb: "הכנסה והוצאת מקסימום, המערך אחרי כל צעד" },
      { id: "build", title: "BUILD-MAX-HEAP", blurb: "המערך אחרי כל MAX-HEAPIFY" },
      { id: "bst", title: "עץ חיפוש בינארי", blurb: "סדר הכנסה → preorder / postorder / לפי רמות" },
      { id: "chain", title: "גיבוב בשרשור", blurb: "h(k) = k mod m, הכנסה לראש הרשימה" },
      { id: "probe", title: "גיבוב בבדיקה לינארית", blurb: "הטבלה אחרי כל ההכנסות" },
    ],
  },
  {
    code: "20109",
    subject: "אלגברה לינארית",
    drills: [
      { id: "rref", title: "דירוג מטריצה", blurb: "פעולות שורה צעד אחר צעד עד צורה מדורגת קנונית" },
      { id: "det", title: "דטרמיננטה 3×3", blurb: "חישוב מדויק, בדיקה מיידית" },
    ],
  },
  {
    code: "20474",
    subject: "חשבון אינפיניטסימלי",
    drills: [
      { id: "deriv", title: "נגזרות", blurb: "כללי המכפלה, המנה והשרשרת" },
      { id: "limit", title: "גבולות של סדרות", blurb: "מנות של פולינומים ועוד" },
    ],
  },
];

const ALL = DRILL_SETS.flatMap((s) => s.drills.map((d) => ({ ...d, code: s.code, subject: s.subject })));

/** The drill chooser, or one drill with an endless supply of new instances. */
export function Drills({ drill, myCourses, seed }: { drill: DrillId | null; myCourses: { code: string; name: string; color: string }[]; seed: number }) {
  const meta = ALL.find((d) => d.id === drill);
  if (!meta) return <Chooser myCourses={myCourses} />;
  const color = myCourses.find((c) => c.code === meta.code)?.color ?? "var(--ink)";
  return <Runner key={meta.id} firstSeed={seed} id={meta.id} title={meta.title} subject={meta.subject} code={meta.code} color={color} />;
}

function Chooser({ myCourses }: { myCourses: { code: string; name: string; color: string }[] }) {
  const mine = new Set(myCourses.map((c) => c.code));
  const sets = [...DRILL_SETS].sort((a, b) => Number(mine.has(b.code)) - Number(mine.has(a.code)));
  return (
    <div className="mt-6 space-y-8">
      {sets.map((s) => {
        const c = myCourses.find((x) => x.code === s.code);
        return (
          <section key={s.code}>
            <h2 className="section-title flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: c?.color ?? "var(--ink-soft)" }} aria-hidden />
              {c?.name ?? s.subject}
              <span className="text-sm font-normal text-ink-soft">{s.code}</span>
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {s.drills.map((d) => (
                <li key={d.id}>
                  <Link href={`/study/drills?d=${d.id}`} className="panel flex min-h-20 items-center gap-3 p-4 hover:border-ink">
                    <div className="min-w-0 flex-1">
                      <span className="block font-medium">{d.title}</span>
                      <span className="block text-sm text-ink-soft">{d.blurb}</span>
                    </div>
                    <Icon name="chevronLeft" className="size-5 text-ink-soft" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Runner({ firstSeed, id, title, subject, code, color }: { firstSeed: number; id: DrillId; title: string; subject: string; code: string; color: string }) {
  // the first seed comes from the server so server and browser render the same drill
  const [seed, setSeed] = useState(firstSeed);
  const [tally, setTally] = useState({ done: 0, first: 0 });
  const [finished, setFinished] = useState<boolean | null>(null);
  const finish = (firstTry: boolean, detail?: Record<string, unknown>) => {
    if (finished !== null) return;
    setFinished(firstTry);
    setTally((t) => ({ done: t.done + 1, first: t.first + (firstTry ? 1 : 0) }));
    recordAttempt({ kind: "drill", drill: id, course_code: code, correct: firstTry, detail: { seed, ...detail } }).catch(() => {});
  };
  const next = () => {
    setFinished(null);
    setSeed(newSeed());
  };
  const props = { seed, onFinish: finish };
  return (
    <div className="mt-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <Link href="/study/drills" className="grid size-10 place-items-center rounded-full text-ink-soft hover:bg-surface hover:text-ink" aria-label="לכל התרגולים">
          <Icon name="chevronRight" className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-soft">{subject}</p>
          <h2 className="section-title">{title}</h2>
        </div>
        {tally.done > 0 && (
          <span className="text-sm tabular-nums text-ink-soft" aria-label="בניסיון ראשון">
            {tally.first}/{tally.done} בניסיון ראשון
          </span>
        )}
      </div>
      <article className="panel mt-3 overflow-hidden" style={{ borderTop: `4px solid ${color}` }}>
        <div className="p-5" key={seed}>
          {id === "heap" && <HeapDrillView {...props} />}
          {id === "build" && <BuildDrillView {...props} />}
          {id === "bst" && <BstDrillView {...props} />}
          {id === "chain" && <ChainDrillView {...props} />}
          {id === "probe" && <ProbeDrillView {...props} />}
          {id === "rref" && <RrefDrill {...props} />}
          {id === "det" && <DetDrillView {...props} />}
          {id === "deriv" && <DerivDrillView {...props} />}
          {id === "limit" && <LimitDrillView {...props} />}
        </div>
      </article>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={next} className={`inline-flex min-h-12 items-center gap-1.5 rounded-full px-6 font-medium ${finished !== null ? "bg-ink text-bg" : "border border-rule hover:border-ink"}`}>
          {finished !== null ? "תרגיל הבא" : "תרגיל אחר"}
          <Icon name="chevronLeft" className="size-4" />
        </button>
      </div>
    </div>
  );
}

type DrillProps = { seed: number; onFinish: (firstTry: boolean, detail?: Record<string, unknown>) => void };

// ---------- list answers (heap, build-heap, BST) ----------

function ListSteps({ steps, onFinish, tree }: { steps: ListStep[]; onFinish: DrillProps["onFinish"]; tree?: (expected: number[]) => React.ReactNode }) {
  const [at, setAt] = useState(0);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "wrong" | "bad">("idle");
  const [missed, setMissed] = useState(false);
  const [shown, setShown] = useState<number[]>([]);
  const step = steps[at];

  const check = () => {
    const got = parseIntList(text);
    if (!got || !got.length) return setState("bad");
    if (sameList(got, step.expected)) {
      setState("idle");
      setText("");
      if (at + 1 === steps.length) onFinish(!missed);
      setAt(at + 1);
    } else {
      setMissed(true);
      setState("wrong");
    }
  };
  const reveal = () => {
    setMissed(true);
    setShown((s) => [...s, at]);
    setState("idle");
    setText("");
    if (at + 1 === steps.length) onFinish(false);
    setAt(at + 1);
  };

  return (
    <div className="mt-4 space-y-4">
      {steps.slice(0, at).map((s, i) => (
        <div key={i}>
          <p className="text-sm text-ink-soft">
            {i + 1}. {s.label} {shown.includes(i) ? "(הוצג)" : "✓"}
          </p>
          <div className="mt-1">
            <ArrayRow values={s.expected} />
          </div>
        </div>
      ))}
      {step ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            check();
          }}
        >
          <label className="block font-medium" htmlFor="ans">
            {at + 1}. {step.label}: איך נראה המערך?
          </label>
          <input
            id="ans"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setState("idle");
            }}
            placeholder="למשל 9 7 8 3"
            className={`${field} mt-2`}
          />
          {state === "bad" && <Verdict ok={false}>כתבו מספרים מופרדים ברווח או בפסיק.</Verdict>}
          {state === "wrong" && <Verdict ok={false}>לא בדיוק. בדקו את ההשוואות עם ההורה / הילדים ונסו שוב.</Verdict>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" className="min-h-11 rounded-full bg-ink px-6 font-medium text-bg">
              בדיקה
            </button>
            {state === "wrong" && (
              <button type="button" onClick={reveal} className="min-h-11 rounded-full border border-rule px-5 hover:border-ink">
                להראות
              </button>
            )}
          </div>
        </form>
      ) : (
        <>
          <Verdict ok={!missed}>{missed ? "סיימת. נסו עוד אחד כדי לקבל את זה בניסיון ראשון." : "מצוין, הכל נכון בניסיון ראשון."}</Verdict>
          {tree?.(steps[steps.length - 1].expected)}
        </>
      )}
    </div>
  );
}

function HeapDrillView({ seed, onFinish }: DrillProps) {
  const d = useMemo(() => genHeapDrill(seed), [seed]);
  return (
    <div>
      <p>ערימת מקסימום (כמערך):</p>
      <div className="mt-2">
        <ArrayRow values={d.start} />
      </div>
      <details className="mt-2 text-sm text-ink-soft">
        <summary className="cursor-pointer">כעץ</summary>
        <TreeSvg root={heapTree(d.start)} />
      </details>
      <p className="mt-3 text-sm text-ink-soft">
        הפעולות לפי הסדר:{" "}
        <bdi dir="ltr" className="font-mono">
          {d.ops.map((o) => (o.t === "insert" ? `INSERT(${o.key})` : "EXTRACT-MAX")).join(", ")}
        </bdi>
      </p>
      <ListSteps steps={d.steps} onFinish={onFinish} tree={(a) => <TreeSvg root={heapTree(a)} />} />
    </div>
  );
}

function BuildDrillView({ seed, onFinish }: DrillProps) {
  const d = useMemo(() => genBuildHeapDrill(seed), [seed]);
  return (
    <div>
      <p>מריצים BUILD-MAX-HEAP על המערך:</p>
      <div className="mt-2">
        <ArrayRow values={d.input} />
      </div>
      <p className="mt-3 text-sm text-ink-soft">
        i רץ מ־⌊n/2⌋ = {Math.floor(d.input.length / 2)} עד 1. כתבו את המערך אחרי כל קריאה ל־MAX-HEAPIFY.
      </p>
      <ListSteps steps={d.steps} onFinish={onFinish} tree={(a) => <TreeSvg root={heapTree(a)} />} />
    </div>
  );
}

function BstDrillView({ seed, onFinish }: DrillProps) {
  const d = useMemo(() => genBstDrill(seed), [seed]);
  return (
    <div>
      <p>מכניסים לעץ חיפוש בינארי ריק, לפי הסדר:</p>
      <p dir="ltr" className="mt-2 font-mono text-lg tabular-nums">
        {d.keys.join(", ")}
      </p>
      <p className="mt-3 text-sm text-ink-soft">כתבו את סדר הסריקה המבוקש.</p>
      <ListSteps steps={d.steps.map((s) => ({ ...s, label: `סריקת ${s.label}` }))} onFinish={onFinish} tree={() => <TreeSvg root={bstFrom(d.keys)} />} />
    </div>
  );
}

// ---------- hashing ----------

function ChainDrillView({ seed, onFinish }: DrillProps) {
  const d = useMemo(() => genChainDrill(seed), [seed]);
  const [rows, setRows] = useState<string[]>(() => Array(d.m).fill(""));
  const [wrong, setWrong] = useState<Set<number> | null>(null);
  const [missed, setMissed] = useState(false);
  const [done, setDone] = useState(false);
  const check = () => {
    const bad = new Set<number>();
    d.expected.forEach((chain, i) => {
      const got = parseIntList(rows[i]);
      if (!got || !sameList(got, chain)) bad.add(i);
    });
    setWrong(bad);
    if (!bad.size) {
      setDone(true);
      onFinish(!missed);
    } else setMissed(true);
  };
  return (
    <div>
      <p>
        טבלת גיבוב בשרשור עם m = {d.m} ו־h(k) = k mod {d.m}. מכניסים לפי הסדר (כל מפתח חדש לראש הרשימה):
      </p>
      <p dir="ltr" className="mt-2 font-mono text-lg tabular-nums">
        {d.keys.join(", ")}
      </p>
      <p className="mt-3 text-sm text-ink-soft">כתבו כל רשימה מהראש לסוף. תא ריק נשאר ריק.</p>
      <div className="mt-3 space-y-2">
        {rows.map((v, i) => (
          <div key={i} className="flex items-center gap-2" dir="ltr">
            <span className="w-10 shrink-0 text-end font-mono text-sm text-ink-soft">T[{i}]</span>
            <input
              value={v}
              inputMode="numeric"
              autoComplete="off"
              disabled={done}
              aria-label={`תא ${i}`}
              onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? e.target.value : x)))}
              className={`${field} ${wrong?.has(i) ? "border-[color:var(--c-rose)]" : ""}`}
            />
          </div>
        ))}
      </div>
      {wrong && (wrong.size ? <Verdict ok={false}>{`${wrong.size} תאים לא נכונים (מסומנים).`}</Verdict> : <Verdict ok>{missed ? "נכון עכשיו." : "נכון בניסיון ראשון."}</Verdict>)}
      {!done && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={check} className="min-h-11 rounded-full bg-ink px-6 font-medium text-bg">
            בדיקה
          </button>
          {missed && (
            <button
              type="button"
              onClick={() => {
                setRows(d.expected.map((c) => c.join(" ")));
                setWrong(new Set());
                setDone(true);
                onFinish(false);
              }}
              className="min-h-11 rounded-full border border-rule px-5 hover:border-ink"
            >
              להראות
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ProbeDrillView({ seed, onFinish }: DrillProps) {
  const d = useMemo(() => genProbeDrill(seed), [seed]);
  const [cells, setCells] = useState<string[]>(() => Array(d.m).fill(""));
  const [wrong, setWrong] = useState<Set<number> | null>(null);
  const [missed, setMissed] = useState(false);
  const [done, setDone] = useState(false);
  const check = () => {
    const bad = new Set<number>();
    d.expected.forEach((k, i) => {
      const t = cells[i].trim();
      if (k === null ? t !== "" : t !== String(k)) bad.add(i);
    });
    setWrong(bad);
    if (!bad.size) {
      setDone(true);
      onFinish(!missed);
    } else setMissed(true);
  };
  return (
    <div>
      <p>
        טבלה בגודל m = {d.m}, כתובות פתוחות עם בדיקה לינארית: h(k, i) = (k mod {d.m} + i) mod {d.m}. מכניסים לפי הסדר:
      </p>
      <p dir="ltr" className="mt-2 font-mono text-lg tabular-nums">
        {d.keys.join(", ")}
      </p>
      <p className="mt-3 text-sm text-ink-soft">כתבו את תוכן הטבלה. תא ריק נשאר ריק.</p>
      <div dir="ltr" className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
        {cells.map((v, i) => (
          <label key={i} className="flex flex-col items-center">
            <span className="text-[11px] text-ink-soft">{i}</span>
            <input
              value={v}
              inputMode="numeric"
              autoComplete="off"
              disabled={done}
              aria-label={`תא ${i}`}
              onChange={(e) => setCells((c) => c.map((x, j) => (j === i ? e.target.value : x)))}
              className={`${field} px-1 text-center ${wrong?.has(i) ? "border-[color:var(--c-rose)]" : ""}`}
            />
          </label>
        ))}
      </div>
      {wrong && (wrong.size ? <Verdict ok={false}>{`${wrong.size} תאים לא נכונים (מסומנים).`}</Verdict> : <Verdict ok>{missed ? "נכון עכשיו." : "נכון בניסיון ראשון."}</Verdict>)}
      {done && (
        <ul className="mt-3 space-y-0.5 text-sm text-ink-soft" dir="ltr">
          {d.keys.map((k, i) => (
            <li key={k}>
              {k}: {d.probes[i].join(" → ")}
            </li>
          ))}
        </ul>
      )}
      {!done && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={check} className="min-h-11 rounded-full bg-ink px-6 font-medium text-bg">
            בדיקה
          </button>
          {missed && (
            <button
              type="button"
              onClick={() => {
                setCells(d.expected.map((k) => (k === null ? "" : String(k))));
                setWrong(new Set());
                setDone(true);
                onFinish(false);
              }}
              className="min-h-11 rounded-full border border-rule px-5 hover:border-ink"
            >
              להראות
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- linear algebra ----------

function DetDrillView({ seed, onFinish }: DrillProps) {
  const d = useMemo(() => genDetDrill(seed), [seed]);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "ok" | "wrong" | "bad" | "shown">("idle");
  const [missed, setMissed] = useState(false);
  const A = d.A;
  const minors = [0, 1, 2].map((j) => det(A.slice(1).map((r) => r.filter((_, k) => k !== j))));
  return (
    <div>
      <p>חשבו את הדטרמיננטה:</p>
      <div className="mt-3">
        <MatrixView A={A} />
      </div>
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = Frac.parse(text);
          if (!f) return setState("bad");
          if (f.eq(d.answer)) {
            setState("ok");
            onFinish(!missed);
          } else {
            setMissed(true);
            setState("wrong");
          }
        }}
      >
        <label className="block font-medium" htmlFor="det">
          det A =
        </label>
        <div className="mt-2 flex gap-2">
          <input id="det" dir="ltr" inputMode="numeric" autoComplete="off" value={text} disabled={state === "ok" || state === "shown"} onChange={(e) => setText(e.target.value)} className={field} />
          <MiniKeys keys={["-"]} />
        </div>
        {state === "bad" && <Verdict ok={false}>כתבו מספר.</Verdict>}
        {state === "wrong" && <Verdict ok={false}>לא בדיוק. נסו פיתוח לפי השורה הראשונה, או לפי שורה/עמודה עם אפסים.</Verdict>}
        {state === "ok" && <Verdict ok>{missed ? "נכון עכשיו." : "נכון בניסיון ראשון."}</Verdict>}
        {(state === "ok" || state === "shown") && (
          <p dir="ltr" className="mt-3 font-mono text-sm text-ink-soft">
            {`${A[0][0]}·(${minors[0]}) − ${A[0][1]}·(${minors[1]}) + ${A[0][2]}·(${minors[2]}) = ${d.answer}`}
          </p>
        )}
        {state !== "ok" && state !== "shown" && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" className="min-h-11 rounded-full bg-ink px-6 font-medium text-bg">
              בדיקה
            </button>
            {missed && (
              <button
                type="button"
                onClick={() => {
                  setState("shown");
                  onFinish(false);
                }}
                className="min-h-11 rounded-full border border-rule px-5 hover:border-ink"
              >
                להראות
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

// ---------- calculus ----------

function ExprAnswer({
  label,
  placeholder,
  check,
  answer,
  why,
  onFinish,
  keys,
}: {
  label: React.ReactNode;
  placeholder: string;
  check: (s: string) => { ok: boolean; error?: string };
  answer: string;
  why: string;
  onFinish: DrillProps["onFinish"];
  keys: string[];
}) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "ok" | "wrong" | "shown">("idle");
  const [error, setError] = useState<string | null>(null);
  const [missed, setMissed] = useState(false);
  const [hint, setHint] = useState(false);
  const over = state === "ok" || state === "shown";
  return (
    <form
      className="mt-4"
      onSubmit={(e) => {
        e.preventDefault();
        const r = check(text);
        setError(r.error ?? null);
        if (r.error) return;
        if (r.ok) {
          setState("ok");
          onFinish(!missed);
        } else {
          setMissed(true);
          setState("wrong");
        }
      }}
    >
      <label className="block font-medium" htmlFor="expr">
        {label}
      </label>
      <input
        id="expr"
        dir="ltr"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={text}
        disabled={over}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        placeholder={placeholder}
        className={`${field} mt-2`}
      />
      <div className="mt-2">
        <MiniKeys keys={keys} />
      </div>
      {error && <Verdict ok={false}>{error}</Verdict>}
      {state === "wrong" && <Verdict ok={false}>לא שווה לתשובה (בדקתי בכמה נקודות).</Verdict>}
      {state === "ok" && <Verdict ok>{missed ? "נכון עכשיו." : "נכון בניסיון ראשון."}</Verdict>}
      {(hint || over) && <p className="mt-2 text-sm text-ink-soft">{why}</p>}
      {over && (
        <p className="mt-2 text-sm">
          תשובה אפשרית:{" "}
          <bdi dir="ltr" className="font-mono">
            {answer}
          </bdi>
        </p>
      )}
      {!over && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" className="min-h-11 rounded-full bg-ink px-6 font-medium text-bg">
            בדיקה
          </button>
          {!hint && (
            <button type="button" onClick={() => setHint(true)} className="min-h-11 rounded-full border border-rule px-5 hover:border-ink">
              רמז
            </button>
          )}
          {missed && (
            <button
              type="button"
              onClick={() => {
                setState("shown");
                onFinish(false);
              }}
              className="min-h-11 rounded-full border border-rule px-5 hover:border-ink"
            >
              להראות
            </button>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-ink-soft">
        כתיבה: <bdi dir="ltr">2x^3, sin(x), e^(2x), ln(x), sqrt(x), (x+1)/(x-1)</bdi>. כפל אפשר גם בלי *.
      </p>
    </form>
  );
}

function DerivDrillView({ seed, onFinish }: DrillProps) {
  const d = useMemo(() => genDerivDrill(seed), [seed]);
  return (
    <div>
      <p>גזרו:</p>
      <p dir="ltr" className="mt-2 font-mono text-xl">
        f(x) = {pretty(d.f)}
      </p>
      <ExprAnswer label={<bdi dir="ltr">f′(x) =</bdi>} placeholder="..." check={(s) => checkDeriv(d, s)} answer={pretty(d.answer)} why={d.rule} onFinish={onFinish} keys={["^", "(", ")", "/", "-"]} />
    </div>
  );
}

function LimitDrillView({ seed, onFinish }: DrillProps) {
  const d = useMemo(() => genLimitDrill(seed), [seed]);
  return (
    <div>
      <p>חשבו את הגבול כאשר n → ∞:</p>
      <p dir="ltr" className="mt-2 font-mono text-xl">
        a(n) = {d.expr}
      </p>
      <ExprAnswer label="הגבול:" placeholder="3/4, -2, ∞, -∞" check={(s) => checkLimit(d.answer, s)} answer={limitText(d.answer)} why={d.why} onFinish={onFinish} keys={["∞", "/", "-"]} />
    </div>
  );
}
