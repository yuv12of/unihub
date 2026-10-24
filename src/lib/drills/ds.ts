/**
 * Data Structures drills (CLRS conventions): max-heap insert / extract-max, BUILD-MAX-HEAP,
 * BST traversals, hash tables with chaining and linear probing. Arrays are shown 0-based in order
 * (A[1..n] in the book is simply the list left to right).
 */
import { rng } from "./rng";

// ---------- heap ----------

/** MAX-HEAPIFY at index i (0-based) on a copy; CLRS tie order: left before right. */
export function maxHeapify(a: readonly number[], i: number, size = a.length): number[] {
  const A = [...a];
  for (;;) {
    const l = 2 * i + 1;
    const r = 2 * i + 2;
    let largest = i;
    if (l < size && A[l] > A[largest]) largest = l;
    if (r < size && A[r] > A[largest]) largest = r;
    if (largest === i) return A;
    [A[i], A[largest]] = [A[largest], A[i]];
    i = largest;
  }
}

/** BUILD-MAX-HEAP: the array after each MAX-HEAPIFY(i), i = ⌊n/2⌋ down to 1 (1-based). */
export function buildMaxHeapSteps(a: readonly number[]): { i: number; after: number[] }[] {
  const steps: { i: number; after: number[] }[] = [];
  let A = [...a];
  for (let i = Math.floor(A.length / 2) - 1; i >= 0; i--) {
    A = maxHeapify(A, i);
    steps.push({ i: i + 1, after: A });
  }
  return steps;
}

export function buildMaxHeap(a: readonly number[]): number[] {
  const s = buildMaxHeapSteps(a);
  return s.length ? s[s.length - 1].after : [...a];
}

export function isMaxHeap(a: readonly number[]): boolean {
  for (let i = 1; i < a.length; i++) if (a[Math.floor((i - 1) / 2)] < a[i]) return false;
  return true;
}

/** MAX-HEAP-INSERT (append, then HEAP-INCREASE-KEY bubbling up). */
export function heapInsert(a: readonly number[], key: number): number[] {
  const A = [...a, key];
  let i = A.length - 1;
  while (i > 0 && A[Math.floor((i - 1) / 2)] < A[i]) {
    const p = Math.floor((i - 1) / 2);
    [A[i], A[p]] = [A[p], A[i]];
    i = p;
  }
  return A;
}

/** HEAP-EXTRACT-MAX: last element to the root, then MAX-HEAPIFY(1). */
export function heapExtractMax(a: readonly number[]): { max: number; heap: number[] } {
  if (!a.length) throw new Error("heap underflow");
  const A = [...a];
  const max = A[0];
  A[0] = A[A.length - 1];
  A.pop();
  return { max, heap: A.length ? maxHeapify(A, 0) : A };
}

export type HeapOp = { t: "insert"; key: number } | { t: "extract" };
export interface ListStep {
  label: string;
  expected: number[];
}
export interface HeapDrill {
  kind: "heap";
  start: number[];
  ops: HeapOp[];
  steps: ListStep[];
}

export function genHeapDrill(seed: number): HeapDrill {
  const r = rng(seed);
  const n = r.int(6, 8);
  const keys = r.distinct(n + 4, 1, 60);
  const start = buildMaxHeap(keys.slice(0, n));
  const extra = keys.slice(n);
  const pattern = r.pick<HeapOp["t"][]>([
    ["insert", "extract", "insert", "extract"],
    ["insert", "insert", "extract", "insert"],
    ["extract", "insert", "insert", "extract"],
    ["insert", "extract", "extract", "insert"],
  ]);
  const ops: HeapOp[] = [];
  const steps: ListStep[] = [];
  let A = start;
  for (const t of pattern) {
    if (t === "insert") {
      const key = extra.shift()!;
      ops.push({ t, key });
      A = heapInsert(A, key);
      steps.push({ label: `הכנסה של ${key}`, expected: A });
    } else {
      ops.push({ t });
      const { max, heap } = heapExtractMax(A);
      A = heap;
      steps.push({ label: `הוצאת המקסימום (${max})`, expected: A });
    }
  }
  return { kind: "heap", start, ops, steps };
}

export interface BuildHeapDrill {
  kind: "build";
  input: number[];
  steps: ListStep[];
}

export function genBuildHeapDrill(seed: number): BuildHeapDrill {
  const r = rng(seed);
  let input: number[];
  do input = r.distinct(r.int(7, 9), 1, 50);
  while (isMaxHeap(input));
  return {
    kind: "build",
    input,
    steps: buildMaxHeapSteps(input).map((s) => ({ label: `אחרי MAX-HEAPIFY(A, ${s.i})`, expected: s.after })),
  };
}

// ---------- BST ----------

export interface BstNode {
  key: number;
  left: BstNode | null;
  right: BstNode | null;
}

export function bstFrom(keys: readonly number[]): BstNode | null {
  let root: BstNode | null = null;
  for (const key of keys) {
    const z: BstNode = { key, left: null, right: null };
    if (!root) {
      root = z;
      continue;
    }
    let x: BstNode = root;
    for (;;) {
      if (key < x.key) {
        if (!x.left) {
          x.left = z;
          break;
        }
        x = x.left;
      } else {
        if (!x.right) {
          x.right = z;
          break;
        }
        x = x.right;
      }
    }
  }
  return root;
}

export type Order = "in" | "pre" | "post" | "level";
export const ORDER_NAME: Record<Order, string> = { in: "inorder", pre: "preorder", post: "postorder", level: "לפי רמות (BFS)" };

export function traverse(t: BstNode | null, order: Order): number[] {
  const out: number[] = [];
  if (order === "level") {
    const q = t ? [t] : [];
    while (q.length) {
      const x = q.shift()!;
      out.push(x.key);
      if (x.left) q.push(x.left);
      if (x.right) q.push(x.right);
    }
    return out;
  }
  const go = (x: BstNode | null) => {
    if (!x) return;
    if (order === "pre") out.push(x.key);
    go(x.left);
    if (order === "in") out.push(x.key);
    go(x.right);
    if (order === "post") out.push(x.key);
  };
  go(t);
  return out;
}

export function bstHeight(t: BstNode | null): number {
  return t ? 1 + Math.max(bstHeight(t.left), bstHeight(t.right)) : -1;
}

export interface BstDrill {
  kind: "bst";
  keys: number[];
  steps: ListStep[];
}

export function genBstDrill(seed: number): BstDrill {
  const r = rng(seed);
  const keys = r.distinct(r.int(7, 9), 1, 99);
  const t = bstFrom(keys);
  const orders = r.shuffle<Order>(["pre", "post", "level"]).slice(0, 2);
  return { kind: "bst", keys, steps: orders.map((o) => ({ label: ORDER_NAME[o], expected: traverse(t, o) })) };
}

// ---------- hashing ----------

/** CHAINED-HASH-INSERT puts the new key at the head of its list; h(k) = k mod m. */
export function chainTable(keys: readonly number[], m: number): number[][] {
  const T: number[][] = Array.from({ length: m }, () => []);
  for (const k of keys) T[k % m].unshift(k);
  return T;
}

/** Open addressing with linear probing: h(k, i) = (k mod m + i) mod m. */
export function probeTable(keys: readonly number[], m: number): { table: (number | null)[]; probes: number[][] } {
  const T: (number | null)[] = Array(m).fill(null);
  const probes: number[][] = [];
  for (const k of keys) {
    const seen: number[] = [];
    for (let i = 0; i < m; i++) {
      const j = (k % m + i) % m;
      seen.push(j);
      if (T[j] === null) {
        T[j] = k;
        break;
      }
    }
    probes.push(seen);
  }
  return { table: T, probes };
}

export interface ChainDrill {
  kind: "chain";
  m: number;
  keys: number[];
  expected: number[][];
}
export interface ProbeDrill {
  kind: "probe";
  m: number;
  keys: number[];
  expected: (number | null)[];
  probes: number[][];
}

export function genChainDrill(seed: number): ChainDrill {
  const r = rng(seed);
  const m = r.pick([5, 7, 9]);
  // make sure at least one collision happens
  let keys: number[];
  do keys = r.distinct(r.int(6, 8), 1, 99);
  while (new Set(keys.map((k) => k % m)).size === keys.length);
  return { kind: "chain", m, keys, expected: chainTable(keys, m) };
}

export function genProbeDrill(seed: number): ProbeDrill {
  const r = rng(seed);
  const m = r.pick([7, 11, 13]);
  let keys: number[];
  do keys = r.distinct(Math.min(m - 2, r.int(6, 8)), 1, 99);
  while (new Set(keys.map((k) => k % m)).size > keys.length - 2);
  const { table, probes } = probeTable(keys, m);
  return { kind: "probe", m, keys, expected: table, probes };
}
