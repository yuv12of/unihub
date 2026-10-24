/** A small seeded random generator, so a drill can be replayed from its seed. */
export interface Rng {
  next(): number;
  int(lo: number, hi: number): number;
  pick<T>(xs: readonly T[]): T;
  shuffle<T>(xs: readonly T[]): T[];
  /** k distinct integers in [lo, hi] */
  distinct(k: number, lo: number, hi: number): number[];
}

export function rng(seed: number): Rng {
  let a = seed >>> 0 || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  return {
    next,
    int,
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    shuffle: (xs) => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    distinct: (k, lo, hi) => {
      const seen = new Set<number>();
      while (seen.size < Math.min(k, hi - lo + 1)) seen.add(int(lo, hi));
      return [...seen];
    },
  };
}

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** "5, 3 2;7" → [5, 3, 2, 7]; null if any piece isn't an integer. Empty string → []. */
export function parseIntList(raw: string): number[] | null {
  const parts = raw
    .replace(/[\[\]]/g, " ")
    .split(/[\s,;]+/)
    .filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    if (!/^[+\-−]?\d+$/.test(p)) return null;
    out.push(Number(p.replace("−", "-")));
  }
  return out;
}

export const sameList = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
