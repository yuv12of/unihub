/**
 * The degree average. Pure and client-safe.
 * OU rules (academic.openu.ac.il/yedion/procedure/Pages/finals.aspx, fetched 2026-11-01): the degree
 * grade is a weighted average of the grades of courses studied at the OU; in sciences a regular course
 * weighs its credits and advanced courses (seminars included) 1.5× their credits. Courses recognized from
 * earlier studies are not in the average. Honors: top 20% of the department's graduates with an average
 * of at least 85; high honors: the top 20% of those, with at least 90 (and ≥ 2/3 of the credits at the OU).
 * Up to three courses may be retaken to improve the degree grade; the last grade counts.
 */
import { creditsOf, gradeWeight, nameOf, statusOf, type DegreePlan } from "@/lib/degree";

export const HONORS = 85;
export const HIGH_HONORS = 90;

export interface GradedRow {
  code: string;
  name: string;
  sem: string | null;
  grade: number;
  weight: number;
}
export interface RemainingRow {
  code: string;
  name: string;
  sem: string | null;
  weight: number;
  expected: number | null;
}

export interface GradeSummary {
  graded: GradedRow[];
  average: number | null;
  weightDone: number;
  remaining: RemainingRow[];
  weightLeft: number;
  /** average if every remaining course gets its expected grade (only rows with an expectation count) */
  projected: number | null;
  /** with every remaining course expected, the projection covers the whole degree */
  projectedComplete: boolean;
  target: number;
  /** average needed in the remaining courses to finish at `target` (null when nothing remains) */
  needed: number | null;
  /** share of the program's credits studied at the OU (honors need ≥ 2/3) */
  ouShare: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function gradeSummary(plan: DegreePlan, current: string): GradeSummary {
  const graded: GradedRow[] = [];
  const remaining: RemainingRow[] = [];
  for (const i of plan.items) {
    if (i.credited) continue;
    const w = gradeWeight(i.code, i.credits);
    if (!w) continue;
    if (i.passed && typeof i.grade === "number") graded.push({ code: i.code, name: nameOf(i), sem: i.sem, grade: i.grade, weight: w });
    else if (!i.passed && statusOf(i, current) !== "done") remaining.push({ code: i.code, name: nameOf(i), sem: i.sem, weight: w, expected: i.expected ?? null });
  }
  const weightDone = graded.reduce((s, r) => s + r.weight, 0);
  const sumDone = graded.reduce((s, r) => s + r.weight * r.grade, 0);
  const weightLeft = remaining.reduce((s, r) => s + r.weight, 0);
  const withExp = remaining.filter((r) => r.expected !== null);
  const wExp = withExp.reduce((s, r) => s + r.weight, 0);
  const sumExp = withExp.reduce((s, r) => s + r.weight * (r.expected as number), 0);
  const target = plan.settings.gradeTarget ?? HONORS;
  const needed = weightLeft > 0 ? round1((target * (weightDone + weightLeft) - sumDone) / weightLeft) : null;
  const recognized = plan.recognized.reduce((s, r) => s + r.credits, 0) + plan.items.filter((i) => i.credited).reduce((s, i) => s + creditsOf(i), 0);
  return {
    graded: graded.sort((a, b) => (a.sem ?? "").localeCompare(b.sem ?? "")),
    average: weightDone ? round1(sumDone / weightDone) : null,
    weightDone,
    remaining,
    weightLeft,
    projected: weightDone + wExp ? round1((sumDone + sumExp) / (weightDone + wExp)) : null,
    projectedComplete: withExp.length === remaining.length,
    target,
    needed,
    ouShare: Math.max(0, 1 - recognized / 120),
  };
}
