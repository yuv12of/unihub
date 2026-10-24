"use client";

import type { BstNode } from "@/lib/drills/ds";
import type { Matrix } from "@/lib/drills/linalg";

/** A row of array cells, left to right with indices (A[1..n] like the book). */
export function ArrayRow({ values, mark }: { values: (number | null)[]; mark?: Set<number> }) {
  return (
    <div dir="ltr" className="flex flex-wrap gap-1">
      {values.map((v, i) => (
        <div key={i} className="flex flex-col items-center">
          <span
            className={`grid h-10 min-w-10 place-items-center rounded-md border px-1.5 font-mono text-base tabular-nums ${mark?.has(i) ? "border-transparent bg-highlight text-highlight-ink" : "border-rule bg-surface"}`}
          >
            {v ?? ""}
          </span>
          <span className="mt-0.5 text-[10px] text-ink-soft">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

/** Draws a binary tree (heap from an array, or a BST) as a small SVG. */
export function TreeSvg({ root }: { root: BstNode | null }) {
  if (!root) return null;
  type P = { key: number; x: number; y: number; parent?: P };
  const nodes: P[] = [];
  let col = 0;
  const walk = (n: BstNode | null, depth: number, parent?: P) => {
    if (!n) return;
    const me: P = { key: n.key, x: 0, y: depth, parent };
    walk(n.left, depth + 1, me);
    me.x = col++;
    nodes.push(me);
    walk(n.right, depth + 1, me);
  };
  walk(root, 0);
  const W = 34;
  const H = 46;
  const width = Math.max(1, col) * W + 10;
  const height = (Math.max(...nodes.map((n) => n.y)) + 1) * H;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full max-w-md" style={{ maxHeight: height * 1.2 }} role="img" aria-label="עץ" direction="ltr">
      {nodes.map((n, i) =>
        n.parent ? <line key={`l${i}`} x1={n.x * W + W / 2 + 5} y1={n.y * H + 18} x2={n.parent.x * W + W / 2 + 5} y2={n.parent.y * H + 18} stroke="var(--rule)" strokeWidth={2} /> : null,
      )}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x * W + W / 2 + 5} cy={n.y * H + 18} r={14} fill="var(--surface)" stroke="var(--ink-soft)" strokeWidth={1.5} />
          <text x={n.x * W + W / 2 + 5} y={n.y * H + 22.5} textAnchor="middle" fontSize={13} fill="var(--ink)" fontFamily="ui-monospace, monospace">
            {n.key}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** A heap array as tree nodes. */
export function heapTree(a: readonly number[], i = 0): BstNode | null {
  if (i >= a.length) return null;
  return { key: a[i], left: heapTree(a, 2 * i + 1), right: heapTree(a, 2 * i + 2) };
}

/** Buttons that type "−" or "/" into the focused field (phone number pads lack them). */
export function MiniKeys({ keys = ["-", "/"] }: { keys?: string[] }) {
  return (
    <div className="flex gap-2" aria-label="מקשים">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            const el = document.activeElement;
            if (!(el instanceof HTMLInputElement)) return;
            const s = el.selectionStart ?? el.value.length;
            const t = el.selectionEnd ?? s;
            const v = el.value.slice(0, s) + k + el.value.slice(t);
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
            setter?.call(el, v);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.setSelectionRange(s + 1, s + 1);
          }}
          className="grid size-11 place-items-center rounded-lg border border-rule font-mono text-lg hover:border-ink"
          aria-label={k === "-" ? "מינוס" : k === "/" ? "שבר" : k}
        >
          {k === "-" ? "−" : k}
        </button>
      ))}
    </div>
  );
}

export function Verdict({ ok, children }: { ok: boolean; children?: React.ReactNode }) {
  return (
    <p
      role="status"
      className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${ok ? "bg-[color:color-mix(in_srgb,var(--c-calculus)_14%,transparent)]" : "bg-[color:color-mix(in_srgb,var(--highlight)_35%,transparent)]"}`}
    >
      {children ?? (ok ? "נכון." : "לא בדיוק.")}
    </p>
  );
}

export const field =
  "min-h-11 w-full rounded-lg border border-rule bg-surface px-3 font-mono text-base tabular-nums focus:border-ink focus:outline-none";

export function MatrixView({ A, aug = 0, mark }: { A: Matrix; aug?: number; mark?: Set<string> }) {
  const cols = A[0]?.length ?? 0;
  return (
    <div dir="ltr" className="inline-block border-x-2 border-ink px-2 py-1">
      <table className="border-separate border-spacing-x-1 font-mono text-lg tabular-nums">
        <tbody>
          {A.map((row, i) => (
            <tr key={i}>
              {row.map((x, j) => (
                <td
                  key={j}
                  className={`min-w-10 px-1.5 py-1 text-center ${aug && j === cols - aug ? "border-l-2 border-ink-soft ps-3" : ""} ${mark?.has(`${i},${j}`) ? "rounded bg-highlight text-highlight-ink" : ""}`}
                >
                  {x.toString()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

