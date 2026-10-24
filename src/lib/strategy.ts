/**
 * Semester strategist: which assignments still have to be done, and which can be let go.
 *
 * Open University courses let you pick which assignments count, within rules: a minimum total
 * weight (assignmentWeight.min) and sometimes "at least N of a group" (20407: at least 3 of 01–05).
 * Pure: give it the course, the user's progress and an estimate of prep time per assignment.
 */
import { duration, ltr } from "@/lib/time";
import type { Course, Assignment, AssignmentType } from "@/lib/semester";
import type { ProgressMap } from "@/lib/progress";
import type { Busy, StudyPrefs } from "@/lib/planner";

const LABEL: Record<AssignmentType, string> = { file: "ממ״ן", online: "ממ״ח", participation: "השתתפות" };
const key = (code: string, n: string) => `${code}-${n}`;
const DAY = 86_400_000;
const addDays = (iso: string, d: number) => new Date(Date.parse(iso + "T00:00:00Z") + d * DAY).toISOString().slice(0, 10);
const days = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);
const dm = (iso: string) => ltr(`${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ו${xs.at(-1)}`);

// ---------- Course rules ----------

export interface GroupRule {
  kind: "atLeast";
  count: number;
  /** assignment numbers in the group, e.g. ["01".."05"] */
  among: string[];
  text: string;
}

/** "Must submit at least 3 of 01-05" / "חובה להגיש לפחות 3 מהמטלות 01 עד 05." → a group rule. */
export function parseRules(rules: string[] | undefined): GroupRule[] {
  const out: GroupRule[] = [];
  for (const r of rules ?? []) {
    const m = r.match(/at least (\d+) of (\d{1,2})\s*[-–]\s*(\d{1,2})/i) ?? r.match(/לפחות (\d+) מ(?:ה)?מטלות (\d{1,2})\s*(?:עד|[-–])\s*(\d{1,2})/);
    if (!m) continue;
    const [lo, hi] = [Number(m[2]), Number(m[3])];
    const among: string[] = [];
    for (let i = lo; i <= hi; i++) among.push(String(i).padStart(2, "0"));
    out.push({ kind: "atLeast", count: Number(m[1]), among, text: `לפחות ${m[1]} מהמטלות ${ltr(`${m[2]}–${m[3]}`)}` });
  }
  return out;
}

/**
 * How assignments beyond the minimum count (the OU "protective" rule). Read from the course
 * requirements pages for 2027א on 24.10.2026; other courses: unknown until checked.
 */
const PROTECTIVE: Record<string, string> = {
  "20109": "מעבר למשקל 11, מטלה נספרת רק אם הציון בה גבוה מציון הבחינה. כלומר מטלות נוספות יכולות רק לשפר.",
  "20474": "מעבר למשקל 10, מטלה נספרת רק אם הציון בה גבוה מציון הבחינה. כלומר מטלות נוספות יכולות רק לשפר.",
  "20407": "נלקחות קודם המטלות עם הציון הגבוה ביותר, עד משקל 25. מעבר למשקל 15, מטלה נספרת רק אם הציון בה גבוה מציון הבחינה.",
};

export function protectiveRule(course: Pick<Course, "code" | "rules">): { known: boolean; text: string } {
  const own = PROTECTIVE[course.code];
  if (own) return { known: true, text: own };
  const fromRules = (course.rules ?? []).find((r) => /גבוה מציון|only if (it )?(raises|improves|higher)/i.test(r));
  if (fromRules) return { known: true, text: fromRules };
  return { known: false, text: "לא ידוע אם מטלות מעבר למינימום נספרות רק כשהן משפרות את הציון (ציון מגן). כדאי לבדוק בדף דרישות הקורס." };
}

// ---------- One course ----------

export type ItemState = "submitted" | "skipped" | "missed" | "open";

export interface StrategyItem {
  n: string;
  label: string; // "ממ״ן 03"
  type: AssignmentType;
  weight: number;
  due: string;
  state: ItemState;
  /** prep minutes still needed (estimate minus time already logged) */
  prep: number;
}

export interface StrategyLine {
  text: string;
  tone: "ok" | "warn" | "info";
}

export interface CourseStrategy {
  code: string;
  min: number;
  max: number;
  earned: number;
  items: StrategyItem[];
  /** the requirement is already met */
  satisfied: boolean;
  /** it can still be met with what's open */
  feasible: boolean;
  /** how many sets of the open assignments meet the requirement */
  combos: number;
  /** the cheapest set (least prep time) that meets it; [] when already met; null when impossible */
  best: string[] | null;
  bestPrep: number;
  /** open assignments without which the requirement can't be met */
  mandatory: string[];
  /** open assignments that can be skipped (one at a time) without risking the requirement */
  safeToSkip: string[];
  rules: { rule: GroupRule; done: number; open: number }[];
  protective: { known: boolean; text: string };
  lines: StrategyLine[];
}

export function courseStrategy({
  course,
  progress,
  today,
  prep,
  spent = {},
  assumeSkipped = [],
}: {
  course: Course;
  progress: ProgressMap;
  today: string;
  /** prep minutes an assignment needs (the planner's prepMinutes) */
  prep: (type: AssignmentType, weight: number) => number;
  /** minutes already logged per assignment number */
  spent?: Record<string, number>;
  /** treat these open assignments as skipped (for "what if" questions) */
  assumeSkipped?: string[];
}): CourseStrategy {
  const { min, max } = course.assignmentWeight;
  const items: StrategyItem[] = course.assignments.map((a: Assignment) => {
    const st = progress[key(course.code, a.n)]?.status;
    const state: ItemState =
      st === "submitted" ? "submitted" : st === "skipped" || assumeSkipped.includes(a.n) ? "skipped" : a.due < today ? "missed" : "open";
    return { n: a.n, label: `${LABEL[a.type]} ${a.n}`, type: a.type, weight: a.weight, due: a.due, state, prep: Math.max(0, prep(a.type, a.weight) - (spent[a.n] ?? 0)) };
  });
  const rules = parseRules(course.rules);
  const submitted = items.filter((i) => i.state === "submitted");
  const open = items.filter((i) => i.state === "open");
  const earned = submitted.reduce((s, i) => s + i.weight, 0);
  const subN = new Set(submitted.map((i) => i.n));

  const meets = (chosen: StrategyItem[]) => {
    const w = earned + chosen.reduce((s, i) => s + i.weight, 0);
    if (w < min) return false;
    const ns = new Set([...subN, ...chosen.map((i) => i.n)]);
    return rules.every((r) => r.among.filter((n) => ns.has(n)).length >= r.count);
  };

  const satisfied = meets([]);
  const feasible = meets(open);
  let combos = 0;
  let best: StrategyItem[] | null = null;
  let bestCost = Infinity;
  // 2^n subsets; n is at most ~12 per course, so this is instant.
  const n = Math.min(open.length, 16);
  for (let mask = 0; mask < 1 << n; mask++) {
    const set = open.filter((_, i) => mask & (1 << i));
    if (!meets(set)) continue;
    combos++;
    const cost = set.reduce((s, i) => s + i.prep, 0) * 100 + set.length;
    if (cost < bestCost) {
      bestCost = cost;
      best = set;
    }
  }
  const mandatory = feasible ? open.filter((a) => !meets(open.filter((x) => x !== a))).map((a) => a.n) : [];
  const safeToSkip = feasible ? open.filter((a) => !mandatory.includes(a.n)).map((a) => a.n) : [];
  const ruleState = rules.map((rule) => ({
    rule,
    done: rule.among.filter((x) => subN.has(x)).length,
    open: rule.among.filter((x) => open.some((o) => o.n === x)).length,
  }));

  const s: CourseStrategy = {
    code: course.code,
    min,
    max,
    earned,
    items,
    satisfied,
    feasible,
    combos,
    best: satisfied ? [] : best ? best.map((i) => i.n) : null,
    bestPrep: satisfied || !best ? 0 : best.reduce((t, i) => t + i.prep, 0),
    mandatory: satisfied ? [] : mandatory,
    safeToSkip: satisfied ? open.map((i) => i.n) : safeToSkip,
    rules: ruleState,
    protective: protectiveRule(course),
    lines: [],
  };
  s.lines = describe(s, open);
  return s;
}

function describe(s: CourseStrategy, open: StrategyItem[]): StrategyLine[] {
  const lines: StrategyLine[] = [];
  const label = (n: string) => s.items.find((i) => i.n === n)?.label ?? n;
  const openW = open.reduce((t, i) => t + i.weight, 0);
  const ruleLeft = s.rules.map((r) => ({ ...r, left: Math.max(0, r.rule.count - r.done) }));

  if (s.satisfied) {
    lines.push({ text: `עמדת בדרישת המטלות: ${s.earned} נקודות מתוך ${s.min} הנדרשות.`, tone: "ok" });
    if (open.length && s.earned < s.max)
      lines.push({ text: `אפשר להגיש עוד עד ${s.max - s.earned} נקודות. ${s.protective.known ? s.protective.text : "כל מטלה נוספת היא רשות."}`, tone: "info" });
    return lines;
  }

  if (!s.feasible) {
    const short = s.earned + openW < s.min;
    const broken = ruleLeft.filter((r) => r.left > r.open);
    lines.push({
      text: short
        ? `גם אם תגיש את כל מה שנשאר תגיע ל־${s.earned + openW} נקודות, פחות מ־${s.min} הנדרשות. כדאי לפנות למרכז ההוראה.`
        : `אי אפשר כבר לעמוד בדרישה "${broken[0]?.rule.text}". כדאי לפנות למרכז ההוראה.`,
      tone: "warn",
    });
    return lines;
  }

  const needed = s.min - s.earned;
  const bestLabels = (s.best ?? []).map(label);
  lines.push({
    text:
      needed > 0
        ? `${s.earned ? `יש לך ${s.earned} נקודות, חסרות עוד ${needed} כדי להגיע ל־${s.min}` : `צריך לצבור ${s.min} נקודות משקל במטלות`}. הדרך הקצרה ביותר: ${list(bestLabels)}${s.bestPrep ? ` (בערך ${duration(s.bestPrep)} הכנה)` : ""}.`
        : `המשקל כבר מספיק, אבל עוד חסרה דרישה: ${list(bestLabels)}.`,
    tone: "info",
  });
  for (const r of ruleLeft)
    if (r.left > 0)
      lines.push({ text: `צריך להגיש ${r.rule.text}: הוגשו ${r.done}, נשארו עוד ${r.left} מתוך ${r.open} הפתוחות בקבוצה.`, tone: r.left === r.open ? "warn" : "info" });
  if (s.mandatory.length)
    lines.push({
      text: `${s.mandatory.length === 1 ? "חובה" : "חובה להגיש את כולן"}: ${list(s.mandatory.map(label))}. בלי ${s.mandatory.length === 1 ? "היא" : "אחת מהן"} כבר לא תעמוד בדרישה.`,
      tone: "warn",
    });
  if (s.safeToSkip.length) {
    const slack = s.earned + openW - s.min;
    const pts = `${slack} ${slack === 1 ? "נקודה" : "נקודות"}`;
    lines.push({
      text:
        s.safeToSkip.length === open.length
          ? `כל מטלה פתוחה אפשר לוותר עליה בלי לסכן את הדרישה, כל עוד הוויתורים יחד לא עוברים ${pts}.`
          : `אפשר לוותר על אחת מאלה בלי לסכן את הדרישה: ${list(s.safeToSkip.map(label))}. בסך הכל יש מרווח של ${pts}.`,
      tone: "ok",
    });
  }
  const participation = open.find((i) => i.type === "participation" && (s.best ?? []).includes(i.n));
  if (participation) lines.push({ text: `${participation.label} לא דורשת הכנה, רק נוכחות במספר המינימלי של מפגשי ההנחיה.`, tone: "info" });
  if (s.combos > 1) lines.push({ text: `יש ${s.combos} צירופים של מטלות שעומדים בדרישה.`, tone: "info" });
  lines.push({ text: s.protective.text, tone: "info" });
  return lines;
}

// ---------- Crunch weeks, across courses ----------

/** Free study minutes between two dates (inclusive): weekly availability, minus rough days and busy time. */
export function freeMinutes(prefs: Pick<StudyPrefs, "availability">, offDays: string[] = [], busy: Busy[] = []) {
  const off = new Set(offDays);
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return (from: string, until: string) => {
    let total = 0;
    for (let d = from; d <= until; d = addDays(d, 1)) {
      if (off.has(d)) continue;
      const slot = prefs.availability[String(new Date(d + "T00:00:00Z").getUTCDay())];
      if (!slot || slot.minutes <= 0) continue;
      const a = toMin(slot.start);
      const z = Math.min(a + slot.minutes, 24 * 60);
      let taken = 0;
      for (const b of busy) if (b.date === d) taken += Math.max(0, Math.min(z, toMin(b.end)) - Math.max(a, toMin(b.start)));
      total += Math.max(0, z - a - taken);
    }
    return total;
  };
}

export interface CrunchItem {
  code: string;
  short: string;
  n: string;
  label: string; // "ממ״ן 03 באינפי"
  due: string;
  weight: number;
  prep: number;
}

export interface Crunch {
  from: string; // first day to work on it
  first: string; // first deadline
  last: string; // last deadline
  items: CrunchItem[];
  demand: number; // prep minutes for everything due by the last deadline
  free: number; // free study minutes before the last deadline
  suggestion: CrunchItem | null;
  text: string;
  tone: "ok" | "warn";
}

/**
 * Weeks with two or more deadlines within 7 days. For each: prep needed vs free time before the
 * deadlines, and when it doesn't fit, an assignment that can be skipped without breaking its
 * course's requirement (the one that gives the least weight per hour of work).
 */
export function crunches({
  courses,
  progress,
  today,
  prep,
  free,
  spent = {},
}: {
  courses: Course[];
  progress: ProgressMap;
  today: string;
  prep: (type: AssignmentType, weight: number) => number;
  free: (from: string, until: string) => number;
  /** minutes logged per "code|n" */
  spent?: Record<string, number>;
}): Crunch[] {
  const spentFor = (code: string) => Object.fromEntries(Object.entries(spent).filter(([k]) => k.startsWith(code + "|")).map(([k, v]) => [k.split("|")[1], v]));
  const skipped = new Map<string, string[]>(); // suggestions so far, per course
  const strat = (c: Course) => courseStrategy({ course: c, progress, today, prep, spent: spentFor(c.code), assumeSkipped: skipped.get(c.code) ?? [] });

  const all: CrunchItem[] = [];
  for (const c of courses) {
    for (const i of strat(c).items)
      if (i.state === "open" && prep(i.type, i.weight) > 0)
        all.push({ code: c.code, short: c.short, n: i.n, label: `${i.label} ב${c.short.endsWith("…") ? c.name : c.short}`, due: i.due, weight: i.weight, prep: i.prep });
  }
  all.sort((a, b) => a.due.localeCompare(b.due) || a.code.localeCompare(b.code));

  const out: Crunch[] = [];
  for (let i = 0; i < all.length; ) {
    const group = all.filter((x, j) => j >= i && days(all[i].due, x.due) <= 6);
    if (group.length < 2) {
      i++;
      continue;
    }
    i += group.length;
    const first = group[0].due;
    const last = group.at(-1)!.due;
    const from = days(today, addDays(first, -14)) > 0 ? addDays(first, -14) : today;
    const due = all.filter((x) => x.due >= from && x.due <= last);
    const demand = due.reduce((s, x) => s + x.prep, 0);
    const freeMin = free(from, addDays(last, -1));
    const over = demand - freeMin;
    let suggestion: CrunchItem | null = null;
    if (over > 0) {
      const candidates = group
        .filter((x) => {
          const c = courses.find((y) => y.code === x.code)!;
          const s = strat(c);
          return s.safeToSkip.includes(x.n);
        })
        .sort((a, b) => a.weight / Math.max(1, a.prep) - b.weight / Math.max(1, b.prep));
      suggestion = candidates[0] ?? null;
      if (suggestion) skipped.set(suggestion.code, [...(skipped.get(suggestion.code) ?? []), suggestion.n]);
    }
    const head = `${first === last ? `ב־${dm(first)}` : `בין ${dm(first)} ל־${dm(last)}`} יש ${group.length} הגשות: ${list(group.map((x) => x.label))}.`;
    const nums = `הן${due.length > group.length ? " (וההגשות שלפניהן)" : ""} דורשות בערך ${duration(demand)} הכנה, ויש לך בערך ${duration(freeMin)} פנויות לפני כן.`;
    const text =
      over <= 0
        ? `${head} ${nums} זה נכנס, אם מתחילים את ${group[0].label} כבר מ־${dm(from)}.`
        : suggestion
          ? `${head} ${nums} אפשר לוותר על ${suggestion.label} (משקל ${suggestion.weight}, בערך ${duration(suggestion.prep)}), והדרישה בקורס עדיין תתקיים.`
          : `${head} ${nums} אין כאן מטלה שאפשר לוותר עליה בלי לסכן דרישה, אז כדאי להתחיל מוקדם יותר או לפנות עוד זמן.`;
    out.push({ from, first, last, items: group, demand, free: freeMin, suggestion, text, tone: over > 0 ? "warn" : "ok" });
  }
  return out;
}
