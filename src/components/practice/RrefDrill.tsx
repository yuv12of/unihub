"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Frac } from "@/lib/drills/fraction";
import { applyOp, checkStep, genReduceDrill, opLabel, rrefProblem, type Matrix, type RowOp } from "@/lib/drills/linalg";
import { MatrixView, MiniKeys, Verdict, field } from "@/components/practice/DrillBits";

type OpKind = RowOp["t"];

/**
 * Row reduction one elementary operation at a time: pick the operation, type the new row, and
 * every step is checked exactly (cells that are off are marked). Finish when the matrix is in
 * reduced row echelon form.
 */
export function RrefDrill({ seed, onFinish }: { seed: number; onFinish: (firstTry: boolean, detail?: Record<string, unknown>) => void }) {
  const d = useMemo(() => genReduceDrill(seed), [seed]);
  const [history, setHistory] = useState<{ A: Matrix; op?: RowOp }[]>([{ A: d.start }]);
  const [kind, setKind] = useState<OpKind>("add");
  const [i, setI] = useState(1);
  const [j, setJ] = useState(0);
  const [c, setC] = useState("");
  const [row, setRow] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [wrongCells, setWrongCells] = useState<Set<string>>(new Set());
  const [slips, setSlips] = useState(0);
  const [done, setDone] = useState(false);

  const A = history[history.length - 1].A;
  const rows = A.length;
  const cols = A[0].length;
  const R = (k: number) => `R${k + 1}`;

  const parseC = (): Frac | null => {
    if (kind === "swap") return Frac.one;
    const f = Frac.parse(c);
    return f && !f.isZero() ? f : null;
  };
  const currentOp = (): RowOp | null => {
    const f = parseC();
    if (!f) return null;
    if (kind === "swap") return i === j ? null : { t: "swap", i, j };
    if (kind === "scale") return { t: "scale", i, c: f };
    return i === j ? null : { t: "add", i, j, c: f };
  };

  const push = (op: RowOp, next: Matrix) => {
    setHistory((h) => [...h, { A: next, op }]);
    setRow([]);
    setC("");
    setWrongCells(new Set());
  };

  const apply = () => {
    const op = currentOp();
    if (!op) {
      setMsg({ ok: false, text: kind !== "scale" && i === j ? "בחרו שתי שורות שונות." : "כתבו מקדם שונה מאפס (אפשר שבר, למשל 3/4 או -2)." });
      return;
    }
    if (op.t === "swap") {
      push(op, applyOp(A, op));
      setMsg({ ok: true, text: `${opLabel(op)}.` });
      return;
    }
    const typedRow = row.map((s) => Frac.parse(s ?? ""));
    if (typedRow.length < cols || typedRow.some((x) => !x)) {
      setMsg({ ok: false, text: `מלאו את כל ${cols} האיברים של ${R(op.i)} החדשה.` });
      return;
    }
    const typed = A.map((r, k) => (k === op.i ? (typedRow as Frac[]) : r));
    const chk = checkStep(A, op, typed);
    if (chk.ok) {
      push(op, chk.expected);
      setMsg({ ok: true, text: `${opLabel(op)}: נכון.` });
    } else {
      setSlips((s) => s + 1);
      setWrongCells(new Set(chk.wrong.map(([r, k]) => `${r},${k}`)));
      setMsg({
        ok: false,
        text: `${chk.wrong.length === 1 ? "איבר אחד לא נכון" : `${chk.wrong.length} איברים לא נכונים`} (מסומנים).${chk.equivalent ? " המטריצה עדיין שקולת־שורות, אבל זו לא התוצאה של הפעולה שבחרת." : " עם הערכים האלה המטריצה כבר לא שקולת־שורות למקורית."}`,
      });
    }
  };

  const finish = () => {
    const problem = rrefProblem(A);
    if (problem) {
      setSlips((s) => s + 1);
      setMsg({ ok: false, text: `עוד לא מדורגת קנונית: ${problem}` });
      return;
    }
    setDone(true);
    setMsg({ ok: true, text: slips ? `מדורגת קנונית, ב־${history.length - 1} פעולות.` : `מדורגת קנונית, ב־${history.length - 1} פעולות ובלי אף טעות.` });
    onFinish(slips === 0, { steps: history.length - 1, slips });
  };

  const showCoef = kind !== "swap";
  const needsRow = kind !== "swap";
  const preview = (() => {
    const op = currentOp();
    return op ? opLabel(op) : null;
  })();

  return (
    <div>
      <p>{d.aug ? "דרגו את המטריצה המורחבת של המערכת" : "דרגו את המטריצה"} עד צורה מדורגת קנונית, פעולה אחרי פעולה.</p>
      <div className="mt-3 overflow-x-auto">
        <MatrixView A={A} aug={d.aug} mark={wrongCells} />
      </div>

      {history.length > 1 && (
        <ol className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-soft" dir="ltr">
          {history.slice(1).map((h, k) => (
            <li key={k}>{h.op && opLabel(h.op)}</li>
          ))}
        </ol>
      )}

      {!done && (
        <div className="mt-4 space-y-3 rounded-xl border border-rule p-3">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="פעולה">
            {(
              [
                ["add", "הוספת כפולה"],
                ["scale", "כפל בקבוע"],
                ["swap", "החלפה"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => {
                  setKind(k);
                  setMsg(null);
                }}
                className={`min-h-11 rounded-lg border text-sm ${kind === k ? "border-ink bg-ink text-bg" : "border-rule hover:border-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2" dir="ltr">
            <RowPick value={i} onChange={setI} rows={rows} label="שורה" />
            <span className="text-ink-soft">{kind === "swap" ? "↔" : kind === "scale" ? "→ c ·" : "→ +c ·"}</span>
            {kind !== "scale" && <RowPick value={j} onChange={setJ} rows={rows} label="שורה שנייה" />}
            {showCoef && (
              <input value={c} onChange={(e) => setC(e.target.value)} placeholder="c" inputMode="numeric" autoComplete="off" aria-label="מקדם" className={`${field} w-24 text-center`} />
            )}
          </div>
          {preview && <p className="text-sm" dir="ltr">{preview}</p>}

          {needsRow && (
            <div>
              <p className="text-sm text-ink-soft">{R(i)} החדשה:</p>
              <div dir="ltr" className="mt-1 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {Array.from({ length: cols }, (_, k) => (
                  <input
                    key={k}
                    value={row[k] ?? ""}
                    onChange={(e) => setRow((r) => Object.assign([...r], { [k]: e.target.value }))}
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`איבר ${k + 1}`}
                    className={`${field} px-1 text-center ${wrongCells.has(`${i},${k}`) ? "border-[color:var(--c-rose)]" : ""}`}
                  />
                ))}
              </div>
              <div className="mt-2">
                <MiniKeys />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={apply} className="min-h-11 rounded-full bg-ink px-6 font-medium text-bg">
              {kind === "swap" ? "להחליף" : "בדיקה והחלה"}
            </button>
            {history.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setHistory((h) => h.slice(0, -1));
                  setMsg(null);
                  setWrongCells(new Set());
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-rule px-4 hover:border-ink"
              >
                <Icon name="undo" className="size-4" />
                ביטול צעד
              </button>
            )}
            <button type="button" onClick={finish} className="min-h-11 rounded-full border border-rule px-4 hover:border-ink">
              סיימתי: זו צורה קנונית
            </button>
          </div>
        </div>
      )}
      {msg && <Verdict ok={msg.ok}>{msg.text}</Verdict>}
      {done && d.aug === 1 && <p className="mt-2 text-sm text-ink-soft">{solutionText(A)}</p>}
    </div>
  );
}

function RowPick({ value, onChange, rows, label }: { value: number; onChange: (v: number) => void; rows: number; label: string }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="min-h-11 rounded-lg border border-rule bg-surface px-3 font-mono">
      {Array.from({ length: rows }, (_, k) => (
        <option key={k} value={k}>
          R{k + 1}
        </option>
      ))}
    </select>
  );
}

/** For a reduced augmented matrix: the solution in words. */
function solutionText(A: Matrix): string {
  const n = A[0].length - 1;
  if (A.some((r) => r.slice(0, n).every((x) => x.isZero()) && !r[n].isZero())) return "יש שורה 0 = b ≠ 0: למערכת אין פתרון.";
  const pivots = A.map((r) => r.slice(0, n).findIndex((x) => !x.isZero())).filter((p) => p >= 0);
  if (pivots.length < n) return `${n - pivots.length} משתנים חופשיים: אינסוף פתרונות.`;
  return `פתרון יחיד: (${A.slice(0, n).map((r) => r[n].toString()).join(", ")}).`;
}
