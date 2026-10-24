/**
 * Exact rational numbers on BigInt, for drills that must be graded without rounding.
 * (BigInt(…) instead of 1n literals: the project targets ES2017.)
 */
const Z = BigInt(0);
const ONE = BigInt(1);

function gcd(a: bigint, b: bigint): bigint {
  a = a < Z ? -a : a;
  b = b < Z ? -b : b;
  while (b !== Z) [a, b] = [b, a % b];
  return a;
}

export class Frac {
  readonly n: bigint;
  readonly d: bigint;

  constructor(n: bigint | number, d: bigint | number = 1) {
    let nn = typeof n === "number" ? BigInt(n) : n;
    let dd = typeof d === "number" ? BigInt(d) : d;
    if (dd === Z) throw new Error("division by zero");
    if (dd < Z) {
      nn = -nn;
      dd = -dd;
    }
    const g = gcd(nn, dd) || ONE;
    this.n = nn / g;
    this.d = dd / g;
  }

  static of(v: Frac | number | bigint): Frac {
    return v instanceof Frac ? v : new Frac(v);
  }

  static readonly zero = new Frac(0);
  static readonly one = new Frac(1);

  /**
   * Reads what a person types: "3", "-2", "3/4", "-3/4", "1.25", " 2 / -6 ". Unicode minus and
   * fraction slash are accepted. Returns null when it isn't a number.
   */
  static parse(raw: string): Frac | null {
    const s = raw.trim().replace(/[−–]/g, "-").replace(/[⁄∕÷]/g, "/").replace(/\s+/g, "");
    if (!s) return null;
    const m = s.match(/^([+-]?\d+(?:\.\d+)?)(?:\/([+-]?\d+(?:\.\d+)?))?$/);
    if (!m) return null;
    const dec = (t: string): Frac => {
      const [i, f = ""] = t.replace("+", "").split(".");
      const neg = i.startsWith("-");
      const whole = BigInt(i.replace("-", "") + f);
      return new Frac(neg ? -whole : whole, BigInt(10) ** BigInt(f.length));
    };
    const a = dec(m[1]);
    if (m[2] === undefined) return a;
    const b = dec(m[2]);
    if (b.isZero()) return null;
    return a.div(b);
  }

  add(o: Frac | number): Frac {
    const b = Frac.of(o);
    return new Frac(this.n * b.d + b.n * this.d, this.d * b.d);
  }
  sub(o: Frac | number): Frac {
    const b = Frac.of(o);
    return new Frac(this.n * b.d - b.n * this.d, this.d * b.d);
  }
  mul(o: Frac | number): Frac {
    const b = Frac.of(o);
    return new Frac(this.n * b.n, this.d * b.d);
  }
  div(o: Frac | number): Frac {
    const b = Frac.of(o);
    if (b.n === Z) throw new Error("division by zero");
    return new Frac(this.n * b.d, this.d * b.n);
  }
  neg(): Frac {
    return new Frac(-this.n, this.d);
  }
  isZero(): boolean {
    return this.n === Z;
  }
  isOne(): boolean {
    return this.n === ONE && this.d === ONE;
  }
  isInt(): boolean {
    return this.d === ONE;
  }
  sign(): -1 | 0 | 1 {
    return this.n === Z ? 0 : this.n < Z ? -1 : 1;
  }
  eq(o: Frac | number): boolean {
    const b = Frac.of(o);
    return this.n === b.n && this.d === b.d;
  }
  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }
  toString(): string {
    return this.d === ONE ? this.n.toString() : `${this.n}/${this.d}`;
  }
}

export const F = (n: number | bigint, d: number | bigint = 1) => new Frac(n, d);
