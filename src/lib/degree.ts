/**
 * Degree plan: which course in which semester, checked against the program's rules.
 * Pure and client-safe (no server imports).
 *
 * Program AF = B.Sc. in Computer Science, single major (academic.openu.ac.il/CS/computer/program/AF.aspx)
 * + general BA rules (academic.openu.ac.il/degrees/pages/ba.aspx). Course facts from the course catalog
 * (www.openu.ac.il/courses/<code>.htm). Offerings from the university's official two-year table
 * (www3.openu.ac.il/ouweb/owal/kursim.draw_form, 2027א–2028ג, fetched 2026-11-01): inside that range a
 * course is either offered or not; beyond it the terms it had in the table are "usually".
 */

export type Term = "א" | "ב" | "ג";
export type Area = "math" | "cs";
/** regular / advanced; seminar = מתקדם סמינריוני. A split course gives `advanced` of its credits at advanced level. */
export type Level = "regular" | "advanced" | "seminar";
export type Block = "math" | "cs-core" | "cs-elective" | "seminar" | "workshop" | "free";

export interface DegreeCourse {
  code: string;
  name: string;
  credits: number;
  level: Level;
  /** for split courses (מודלים חישוביים: 3 regular + 2 advanced) */
  advanced?: number;
  area: Area;
  block: Block;
  /** AND of OR-groups: [["20407"], ["20441", "11238"]] */
  needs?: string[][];
  recommended?: string[];
  /** CS credits finished before (36 for seminars, שפות תכנות…) */
  minCs?: number;
  /** any credits finished before */
  minCredits?: number;
  /** admission needs the library's bibliographic training (and English, done) */
  biblio?: boolean;
  /** usually admitted only after at least one advanced CS course */
  afterAdvanced?: boolean;
  /** registration needs written approval from the seminars coordinator */
  approval?: boolean;
  /** taught in English: counts as an English content course */
  english?: boolean;
  /** ends in a classroom exam (מתכונת הערכה מסכמת = בחינת כיתה); seminars and workshops don't */
  exam: boolean;
  /** terms it is offered in (from the official table) */
  offered: Term[];
  note?: string;
}

/** The official two-year offering table: semesters each course is offered in, 2027א–2028ג. */
export const TABLE_SEMESTERS = ["2027א", "2027ב", "2027ג", "2028א", "2028ב", "2028ג"];
const Y = (...terms: string[]) => terms.flatMap((t) => ["2027" + t, "2028" + t]);
const OFFER_TABLE: Record<string, string[]> = {
  "20476": Y("א", "ב", "ג"),
  "20109": Y("א", "ב", "ג"),
  "20229": Y("א", "ב", "ג"),
  "20474": Y("א", "ב", "ג"),
  "20475": Y("א", "ב", "ג"),
  "20425": Y("א", "ב", "ג"),
  "20441": Y("א", "ב"),
  "20407": Y("א", "ב"),
  "20417": Y("א", "ב"),
  "20465": Y("א", "ב"),
  "20604": Y("א", "ב"),
  "20471": Y("א", "ג"),
  "20466": Y("א", "ב"),
  "20594": Y("א", "ב"),
  "20905": Y("ב"),
  "20277": Y("א", "ג"),
  "20436": Y("א", "ב"),
  "20606": Y("א", "ב"),
  "20551": Y("א", "ב"),
  "20554": Y("א", "ב"),
  "20906": Y("א", "ב"),
  "20948": Y("א", "ג"),
  "20937": Y("ב", "ג"),
  "20562": Y("ב"),
  "20580": Y("א"),
  "20595": Y("ב"),
  "20942": Y("א", "ב"),
  "20944": ["2027א", "2027ב", "2028א"],
  "20940": Y("א"),
  "20946": Y("ב"),
  "20368": Y("א", "ב", "ג"),
  "20390": Y("א", "ב", "ג"),
  "20372": Y("א", "ב", "ג"),
  "20954": Y("א", "ב", "ג"),
  "20973": Y("ב"),
  "20586": Y("א", "ב"),
  "20936": Y("א", "ג"),
};
const TERMS_ALL: Term[] = ["א", "ב", "ג"];
const termsOf = (code: string): Term[] => {
  const t = OFFER_TABLE[code];
  if (!t) return TERMS_ALL;
  return TERMS_ALL.filter((x) => t.some((s) => s.endsWith(x)));
};

type Def = Omit<DegreeCourse, "area" | "block" | "exam" | "offered"> & { exam?: boolean };
const make = (area: Area, block: Block, exam: boolean) => (c: Def): DegreeCourse => ({ exam, ...c, area, block, offered: termsOf(c.code) });
const MATH = make("math", "math", true);
const CORE = make("cs", "cs-core", true);
const ELEC = make("cs", "cs-elective", true);
const SEM = (c: Omit<Def, "level" | "credits">): DegreeCourse =>
  make("cs", "seminar", false)({ credits: 3, level: "seminar", minCs: 36, biblio: true, afterAdvanced: true, approval: true, ...c });
const WORK = (c: Omit<Def, "level" | "credits">): DegreeCourse => make("cs", "workshop", false)({ credits: 3, level: "seminar", minCs: 36, biblio: true, ...c });

const JAVA = ["20441", "11238"];
const DS = ["20407"];

/** Program AF course list (the courses the planner knows). */
export const COURSES: DegreeCourse[] = [
  // א. math, mandatory 35
  MATH({ code: "20476", name: "מתמטיקה בדידה", credits: 4, level: "regular" }),
  MATH({ code: "20109", name: "אלגברה לינארית 1", credits: 7, level: "regular" }),
  MATH({ code: "20229", name: "אלגברה לינארית 2", credits: 5, level: "regular", needs: [["20109"]] }),
  MATH({ code: "20474", name: "חשבון אינפיניטסימלי 1", credits: 7, level: "regular" }),
  MATH({ code: "20475", name: "חשבון אינפיניטסימלי 2", credits: 7, level: "regular", needs: [["20474"]] }),
  MATH({ code: "20425", name: "הסתברות ומבוא לסטטיסטיקה למדמ\"ח", credits: 5, level: "regular", needs: [["20474"], ["20475"]] }),

  // ב. CS mandatory 42
  CORE({ code: "20441", name: "מבוא למדעי המחשב ושפת Java", credits: 6, level: "regular" }),
  CORE({ code: "20407", name: "מבני נתונים ומבוא לאלגוריתמים", credits: 6, level: "regular", needs: [JAVA, ["20476"]], recommended: ["20474", "20109", "20425"] }),
  CORE({ code: "20417", name: "אלגוריתמים", credits: 5, level: "regular", needs: [["20476"], DS, JAVA], recommended: ["20474", "20109", "20425"] }),
  CORE({ code: "20465", name: "מעבדה בתכנות מערכות", credits: 4, level: "regular", needs: [JAVA] }),
  CORE({ code: "20604", name: "מודלים חישוביים", credits: 5, level: "regular", advanced: 2, needs: [DS], recommended: ["20417", "20466"] }),
  CORE({ code: "20471", name: "ארגון המחשב", credits: 4, level: "regular" }),
  CORE({ code: "20466", name: "לוגיקה למדעי המחשב", credits: 4, level: "regular", needs: [["20476"]], note: "דורש גם שני קורסים במתמטיקה ושניים במדעי המחשב" }),
  CORE({ code: "20594", name: "מערכות הפעלה", credits: 4, level: "advanced", needs: [["20465"], DS], recommended: ["20471"], biblio: true }),
  CORE({ code: "20905", name: "שפות תכנות", credits: 4, level: "advanced", needs: [DS, ["20604"], ["20465"], ["20417"]], minCs: 36, biblio: true }),

  // ב. CS electives (≥28 when the mandatory part is 42)
  ELEC({ code: "20277", name: "מערכות בסיסי-נתונים", credits: 4, level: "regular" }),
  ELEC({ code: "20436", name: "עקרונות פיתוח מערכות מידע", credits: 4, level: "regular" }),
  ELEC({ code: "20606", name: "תכנות וניתוח נתונים בשפת פייתון", credits: 6, level: "regular", note: "חפיפה עם 20441: שניהם יחד 9 נ\"ז" }),
  ELEC({ code: "20551", name: "מבוא לבינה מלאכותית", credits: 4, level: "advanced", needs: [["20417"], DS, [...JAVA, "20606"], ["20425"]], recommended: ["20476", "20466"], biblio: true }),
  ELEC({ code: "20554", name: "תכנות מתקדם בשפת Java", credits: 4, level: "advanced", needs: [DS], biblio: true }),
  ELEC({ code: "20906", name: "תכנות מונחה עצמים", credits: 4, level: "advanced", needs: [DS], biblio: true }),
  ELEC({ code: "20948", name: "רשתות תקשורת מחשבים", credits: 4, level: "advanced", needs: [DS, ["20425"]], recommended: ["20417"], biblio: true }),
  ELEC({ code: "20937", name: "תכנות מערכות דפנסיבי", credits: 4, level: "advanced", needs: [["20554"], ["20465"], ["20594"]], recommended: ["20948"], biblio: true }),
  ELEC({ code: "20562", name: "גרפיקה ממוחשבת", credits: 4, level: "advanced", needs: [["20474"], ["20475"], ["20109"], DS, ["20465"]], biblio: true }),
  ELEC({ code: "20580", name: "מבוא לקריפטוגרפיה", credits: 4, level: "advanced", needs: [["20109"], ["20425"], JAVA], recommended: ["20407", "20476"], biblio: true }),
  ELEC({ code: "20595", name: "כריית מידע", credits: 4, level: "advanced", biblio: true }),
  ELEC({ code: "20942", name: "מבוא ללמידת מכונה", credits: 4, level: "advanced", needs: [["20425"], ["20474"], ["20475"], ["20109"], JAVA], biblio: true }),
  ELEC({ code: "20944", name: "רובוטיקה אלגוריתמית", credits: 4, level: "advanced", needs: [["20109"], ["20474"], ["20475"], [...JAVA, "20606"]], recommended: ["20417"], minCredits: 36, biblio: true }),
  ELEC({ code: "20940", name: "מבוא לאבטחת המרחב המקוון", credits: 4, level: "advanced", needs: [["20594"], ["20948"]], biblio: true }),
  ELEC({ code: "20946", name: "מבוא לבדיקות תוכנה (אנגלית)", credits: 4, level: "advanced", english: true, needs: [JAVA, ["20417"], ["20465"], ["20604"], ["20476"]], minCredits: 36, biblio: true }),

  // ג. seminar (3) + workshop (3)
  SEM({ code: "20368", name: "סמינר בהנדסת תוכנה" }),
  SEM({ code: "20390", name: "סמינר באלגוריתמים" }),
  SEM({ code: "20372", name: "סמינר בבינה מלאכותית" }),
  SEM({ code: "20954", name: "סמינר במדעי המחשב (אנגלית)", english: true, note: "נלמד באנגלית — קורס תוכן באנגלית" }),
  WORK({ code: "20973", name: "סדנה בסימולציה של מערכות אוטונומיות (אנגלית)", english: true, needs: [["20417"]], recommended: ["20942", "20937"] }),
  WORK({ code: "20586", name: "סדנה בתכנות מונחה עצמים" }),
  WORK({ code: "20936", name: "סדנה במדעי הנתונים" }),
];

export const COURSE = Object.fromEntries(COURSES.map((c) => [c.code, c])) as Record<string, DegreeCourse>;

// ─── semesters ────────────────────────────────────────────────────────────────

const TERMS: Term[] = ["א", "ב", "ג"];
export const isSemester = (s: unknown): s is string => typeof s === "string" && /^20\d\d[אבג]$/.test(s);
export const termOf = (s: string) => s.slice(4) as Term;
export const semIndex = (s: string) => Number(s.slice(0, 4)) * 3 + TERMS.indexOf(termOf(s));
export const semFromIndex = (i: number) => `${Math.floor(i / 3)}${TERMS[i % 3]}`;
export const nextSemester = (s: string, summers = true) => {
  let i = semIndex(s) + 1;
  if (!summers && TERMS[i % 3] === "ג") i++;
  return semFromIndex(i);
};
/** "2027ב" → "ב׳ 2027 · אביב" */
export const semLabel = (s: string) => `${termOf(s)}׳ ${s.slice(0, 4)}`;
export const seasonOf = (s: string) => ({ א: "סתיו", ב: "אביב", ג: "קיץ" })[termOf(s)];
/** Rough months of a semester, for "when do I finish". */
export const semMonths = (s: string) => {
  const y = Number(s.slice(0, 4));
  return { א: `אוקט׳ ${y - 1} – פבר׳ ${y}`, ב: `מרץ – יולי ${y}`, ג: `יולי – ספט׳ ${y}` }[termOf(s)];
};

// ─── the plan ─────────────────────────────────────────────────────────────────

/** credited = recognized from earlier studies (no semester); done/now/planned by semester. */
export type ItemStatus = "credited" | "done" | "now" | "planned";

export interface PlanItem {
  code: string;
  /** null = credited, or not yet placed */
  sem: string | null;
  credited?: boolean;
  /** finished with a pass (set for past semesters) */
  passed?: boolean;
  /** final grade (from Sheilta) */
  grade?: number | null;
  /** the grade I expect, for the average calculator (future courses) */
  expected?: number | null;
  /** last attempt that didn't pass (Sheilta "אי עמידה בדרישות"): the item went back to "not placed" */
  failedIn?: string;
  /** courses outside AF (seen in Sheilta): their name and credits */
  name?: string;
  credits?: number;
}

export interface Recognized {
  label: string;
  area: Area | "science";
  credits: number;
}

export interface PlanSettings {
  /** credits per semester the planner aims for */
  perSemester: number;
  summers: boolean;
  /** finish by this semester (inclusive) */
  target: string | null;
  biblioDone: boolean;
  englishExempt: boolean;
  /** English content courses required (2 after a placement-test exemption, for students from 2022) */
  englishContent: number;
  /** the degree average I aim for (average calculator) */
  gradeTarget: number;
}

export interface DegreePlan {
  program: "AF";
  items: PlanItem[];
  recognized: Recognized[];
  settings: PlanSettings;
}

export const DEFAULT_SETTINGS: PlanSettings = { perSemester: 16, summers: false, target: null, biblioDone: false, englishExempt: false, englishContent: 2, gradeTarget: 85 };

export function statusOf(item: PlanItem, current: string): ItemStatus | null {
  if (item.credited) return "credited";
  if (!item.sem) return null;
  const d = semIndex(item.sem) - semIndex(current);
  if (d < 0) return "done";
  if (d === 0) return "now";
  return "planned";
}

/** Is `code` finished before semester `sem` (credited, or in an earlier semester)? */
function finishedBefore(plan: DegreePlan, code: string, sem: string) {
  return plan.items.some((i) => i.code === code && (i.credited || (i.sem && semIndex(i.sem) < semIndex(sem))));
}

const csCredits = (c: DegreeCourse) => (c.area === "cs" ? c.credits : 0);

function creditsBefore(plan: DegreePlan, sem: string) {
  let cs = plan.recognized.filter((r) => r.area === "cs").reduce((s, r) => s + r.credits, 0);
  let all = plan.recognized.reduce((s, r) => s + r.credits, 0);
  for (const i of plan.items) {
    const c = COURSE[i.code];
    if (!c) continue;
    if (i.credited || (i.sem && semIndex(i.sem) < semIndex(sem))) {
      cs += csCredits(c);
      all += c.credits;
    }
  }
  return { cs, all };
}

// ─── offering ─────────────────────────────────────────────────────────────────

export type Offer = "yes" | "usually" | "unusual" | "no";
export function offerIn(c: DegreeCourse, sem: string): Offer {
  const table = OFFER_TABLE[c.code];
  if (table && TABLE_SEMESTERS.includes(sem)) return table.includes(sem) ? "yes" : "no";
  return c.offered.includes(termOf(sem)) ? "usually" : "unusual";
}

/** Grade weight in the degree average (sciences): credits; advanced and seminar credits count 1.5×. */
export function gradeWeight(code: string, credits?: number): number {
  const c = COURSE[code];
  if (!c) return credits ?? 0;
  if (c.level === "advanced" || c.level === "seminar") return c.credits * 1.5;
  return c.credits - (c.advanced ?? 0) + (c.advanced ?? 0) * 1.5;
}

/** Credits of a plan item: the program's course, or what Sheilta says for a course outside AF. */
export const creditsOf = (i: { code: string; credits?: number }) => COURSE[i.code]?.credits ?? i.credits ?? 0;
export const nameOf = (i: { code: string; name?: string }) => COURSE[i.code]?.name ?? i.name ?? i.code;

// ─── checks for one placed course ─────────────────────────────────────────────

export type Severity = "error" | "warn" | "info";
export interface Issue {
  severity: Severity;
  text: string;
}

export function itemIssues(plan: DegreePlan, item: PlanItem, current: string): Issue[] {
  const c = COURSE[item.code];
  const out: Issue[] = [];
  if (!c)
    return item.passed
      ? [{ severity: "info", text: "קורס מחוץ לתכנית: נספר בסך הנ\"ז כבחירה חופשית (עד 9 נ\"ז)" }]
      : [{ severity: "warn", text: "קורס שלא בתכנית AF — בדקו שהוא נספר" }];
  if (item.failedIn && !item.sem) out.push({ severity: "warn", text: `לא הושלם ב${semLabel(item.failedIn)} — לשבץ מחדש` });
  if (item.credited || !item.sem) return out;
  const st = statusOf(item, current);
  if (st === "done" || st === "now") return out; // already happened
  const sem = item.sem;
  for (const group of c.needs ?? []) {
    if (group.some((g) => finishedBefore(plan, g, sem))) continue;
    const inPlan = group.find((g) => plan.items.some((i) => i.code === g));
    const names = group.map((g) => COURSE[g]?.name ?? g).join(" או ");
    out.push({ severity: "error", text: inPlan ? `צריך לסיים קודם: ${names}` : `חסר בתכנית תנאי קדם: ${names}` });
  }
  for (const r of c.recommended ?? []) {
    if (!finishedBefore(plan, r, sem) && plan.items.some((i) => i.code === r)) out.push({ severity: "info", text: `מומלץ לפני: ${COURSE[r]?.name ?? r}` });
  }
  const before = creditsBefore(plan, sem);
  if (c.minCs && before.cs < c.minCs) out.push({ severity: "error", text: `דורש ${c.minCs} נ"ז במדעי המחשב לפני (יהיו ${before.cs})` });
  if (c.minCredits && before.all < c.minCredits) out.push({ severity: "error", text: `דורש ${c.minCredits} נ"ז לפני (יהיו ${before.all})` });
  if (c.afterAdvanced) {
    const adv = plan.items.some((i) => {
      const x = COURSE[i.code];
      return x && x.area === "cs" && x.level === "advanced" && (i.credited || (i.sem && semIndex(i.sem) < semIndex(sem)));
    });
    if (!adv) out.push({ severity: "warn", text: "בדרך כלל מתקבלים רק אחרי קורס מתקדם אחד לפחות" });
  }
  const offer = offerIn(c, sem);
  const when = c.offered.map((t) => `${t}׳`).join(", ");
  if (offer === "no") out.push({ severity: "error", text: `לא נפתח ב${semLabel(sem)} (נפתח: ${when})` });
  else if (offer === "unusual") out.push({ severity: "warn", text: `בדרך כלל נפתח רק ב: ${when}` });
  if (c.biblio && !plan.settings.biblioDone) {
    const next = semIndex(sem) - semIndex(current) <= 1;
    out.push({ severity: next ? "error" : "warn", text: "דורש הדרכה ביבליוגרפית לפני ההרשמה" });
  }
  if (c.approval) out.push({ severity: "info", text: "הרשמה באישור בכתב מהאחראי לסמינרים — לפנות כסמסטר מראש" });
  if (c.note) out.push({ severity: "info", text: c.note });
  return out;
}

// ─── degree requirements ──────────────────────────────────────────────────────

export interface Requirement {
  id: string;
  label: string;
  have: number;
  need: number;
  /** counted only from done/credited (not planned) */
  done: number;
  ok: boolean;
  /** "max" rules pass when have ≤ need */
  max?: boolean;
  detail?: string;
}

export interface Totals {
  all: number;
  done: number;
  now: number;
  planned: number;
  unplaced: number;
}

function counted(plan: DegreePlan, current: string, onlyDone: boolean) {
  const items = plan.items.filter((i) => {
    const s = statusOf(i, current);
    if (!s) return false;
    return onlyDone ? s === "credited" || s === "done" : true;
  });
  const courses = items.map((i) => COURSE[i.code]).filter(Boolean) as DegreeCourse[];
  const sum = (f: (c: DegreeCourse) => number) => courses.reduce((s, c) => s + f(c), 0);
  const recCs = plan.recognized.filter((r) => r.area === "cs").reduce((s, r) => s + r.credits, 0);
  // courses outside AF (from Sheilta) count toward the total as free electives
  const recAll = plan.recognized.reduce((s, r) => s + r.credits, 0) + items.filter((i) => !COURSE[i.code]).reduce((s, i) => s + creditsOf(i), 0);
  const adv = (c: DegreeCourse) => (c.level === "advanced" || c.level === "seminar" ? c.credits : (c.advanced ?? 0));
  return {
    codes: new Set(items.map((i) => i.code)),
    all: sum((c) => c.credits) + recAll,
    // every course in AF is a science course; recognized "science"/"cs" points too
    science: sum((c) => c.credits) + recAll,
    cs: sum(csCredits) + recCs,
    csAdvanced: sum((c) => (c.area === "cs" ? adv(c) : 0)),
    advanced: sum(adv),
    open: 0,
    math: sum((c) => (c.block === "math" ? c.credits : 0)),
    core: sum((c) => (c.block === "cs-core" ? c.credits : 0)),
    elective: sum((c) => (c.block === "cs-elective" ? c.credits : 0)),
    seminar: courses.filter((c) => c.block === "seminar").length,
    workshop: courses.filter((c) => c.block === "workshop").length,
    english: courses.filter((c) => c.english).length,
  };
}

const MATH_CODES = COURSES.filter((c) => c.block === "math").map((c) => c.code);
const CORE_GROUPS: string[][] = [JAVA, ["20407"], ["20417"], ["20465"], ["20604"], ["20471"], ["20466"], ["20594"], ["20905"]];

export function requirements(plan: DegreePlan, current: string): Requirement[] {
  const p = counted(plan, current, false);
  const d = counted(plan, current, true);
  const missing = (codes: Set<string>, groups: string[][]) => groups.filter((g) => !g.some((c) => codes.has(c))).map((g) => COURSE[g[0]]?.name ?? g[0]);
  const mathMissing = missing(p.codes, MATH_CODES.map((c) => [c]));
  const coreMissing = missing(p.codes, CORE_GROUPS);
  const r = (id: string, label: string, have: number, done: number, need: number, detail?: string, max = false): Requirement => ({
    id,
    label,
    have,
    done,
    need,
    max,
    ok: max ? have <= need : have >= need,
    detail,
  });
  return [
    r("total", "סך הכול נ\"ז לתואר", p.all, d.all, 120),
    r("science", "נ\"ז במדעים", p.science, d.science, 111),
    r("cs", "נ\"ז במדעי המחשב", p.cs, d.cs, 76),
    r("cs-adv", "נ\"ז מתקדמות במדעי המחשב", p.csAdvanced, d.csAdvanced, 28, "הדרישה 27–28; נספרים גם הסמינר והסדנה"),
    r("adv", "נ\"ז מתקדמות (כללי)", p.advanced, d.advanced, 24),
    r("open", "נ\"ז ברמת פתיחה (לכל היותר)", p.open, d.open, 36, undefined, true),
    { ...r("math", "תשתית במתמטיקה — כל קורסי החובה", p.math, d.math, 35, mathMissing.length ? `חסר: ${mathMissing.join(", ")}` : undefined), ok: !mathMissing.length && p.math >= 35 },
    { ...r("core", "מדעי המחשב — כל קורסי החובה", p.core, d.core, 42, coreMissing.length ? `חסר: ${coreMissing.join(", ")}` : undefined), ok: !coreMissing.length },
    r("elective", "בחירה במדעי המחשב", p.elective, d.elective, 28, "28 נ\"ז כשהחובה היא 42 נ\"ז"),
    r("seminar", "סמינר (3 נ\"ז מס)", p.seminar, d.seminar, 1),
    r("workshop", "סדנה (3 נ\"ז מס)", p.workshop, d.workshop, 1),
    r("english", "קורסי תוכן באנגלית", p.english, d.english, plan.settings.englishContent, "למי שהחל מ־2022 עם פטור ממבחן מיון: 2"),
  ];
}

export function totals(plan: DegreePlan, current: string): Totals {
  const t: Totals = { all: 0, done: 0, now: 0, planned: 0, unplaced: 0 };
  const rec = plan.recognized.reduce((s, r) => s + r.credits, 0);
  t.done += rec;
  for (const i of plan.items) {
    const cr = creditsOf(i);
    const s = statusOf(i, current);
    if (s === "credited" || s === "done") t.done += cr;
    else if (s === "now") t.now += cr;
    else if (s === "planned") t.planned += cr;
    else t.unplaced += cr;
  }
  t.all = t.done + t.now + t.planned;
  return t;
}

/** Semesters from the first used one to the last planned, each with its items and credits. */
export function semestersOf(plan: DegreePlan, current: string) {
  const used = plan.items.filter((i) => i.sem && !i.credited).map((i) => semIndex(i.sem!));
  const from = Math.min(semIndex(current), ...used);
  const to = Math.max(semIndex(current) + 1, ...used);
  const out: { sem: string; items: PlanItem[]; credits: number }[] = [];
  for (let k = from; k <= to; k++) {
    const sem = semFromIndex(k);
    const items = plan.items.filter((i) => !i.credited && i.sem === sem);
    if (termOf(sem) === "ג" && !items.length && !plan.settings.summers) continue;
    out.push({ sem, items, credits: items.reduce((s, i) => s + creditsOf(i), 0) });
  }
  return out;
}

export function lastSemester(plan: DegreePlan) {
  const s = plan.items.filter((i) => i.sem && !i.credited).map((i) => semIndex(i.sem!));
  return s.length ? semFromIndex(Math.max(...s)) : null;
}

/** Things to do soon, in order of urgency. */
export function actions(plan: DegreePlan, current: string): { text: string; urgent: boolean }[] {
  const out: { text: string; urgent: boolean }[] = [];
  const next = nextSemester(current, plan.settings.summers);
  const nextItems = plan.items.filter((i) => i.sem === next);
  if (!plan.settings.biblioDone) {
    const firstBiblio = plan.items
      .filter((i) => i.sem && semIndex(i.sem) > semIndex(current) && COURSE[i.code]?.biblio)
      .map((i) => i.sem!)
      .sort((a, b) => semIndex(a) - semIndex(b))[0];
    if (firstBiblio)
      out.push({
        text: `להשלים הדרכה ביבליוגרפית בספרייה (אתר ההדרכה + מבחן) — תנאי קבלה לכל הקורסים המתקדמים, הראשון ב${semLabel(firstBiblio)}`,
        urgent: firstBiblio === next,
      });
  }
  if (nextItems.length) out.push({ text: `להירשם ל${semLabel(next)}: ${nextItems.map(nameOf).join(", ")}`, urgent: true });
  for (const i of plan.items) {
    const c = COURSE[i.code];
    if (c?.approval && i.sem && semIndex(i.sem) > semIndex(current))
      out.push({ text: `לבקש אישור בכתב מהאחראי לסמינרים ל"${c.name}", לפני ההרשמה ל${semLabel(i.sem)}`, urgent: semIndex(i.sem) - semIndex(current) <= 1 });
  }
  return out;
}

// ─── automatic placement ──────────────────────────────────────────────────────

/**
 * Re-places every course that hasn't started yet (planned or unplaced), semester by semester from the
 * next one: each semester takes the feasible set (prerequisites finished earlier, offered, credit
 * thresholds) that best fills `perSemester`, preferring courses that unlock long chains and courses that
 * open in one term only. Done / current / credited courses stay. Returns a new plan; nothing placed
 * that can't be placed within `horizon` semesters (it stays unplaced).
 */
export function autoPlan(plan: DegreePlan, current: string, horizon = 10): DegreePlan {
  const fixed = plan.items.filter((i) => {
    const s = statusOf(i, current);
    return s === "credited" || s === "done" || s === "now";
  });
  let todo = plan.items.filter((i) => !fixed.includes(i)).map((i) => i.code);
  const work: DegreePlan = { ...plan, items: [...fixed] };
  const depth = new Map<string, number>();
  const dependents = (code: string) => todo.filter((t) => COURSE[t]?.needs?.some((g) => g.includes(code)));
  const depthOf = (code: string, seen = new Set<string>()): number => {
    if (depth.has(code)) return depth.get(code)!;
    if (seen.has(code)) return 0;
    seen.add(code);
    const d = Math.max(0, ...dependents(code).map((x) => 1 + depthOf(x, seen)));
    depth.set(code, d);
    return d;
  };
  const weight = (code: string) => {
    const c = COURSE[code];
    if (!c) return 1;
    const narrow = c.offered.length === 1 ? 1 : 0;
    // seminars late: their paper is long and they want advanced courses first
    const late = c.level === "seminar" ? -0.3 : 0;
    return 1 + 2 * depthOf(code) + narrow + late;
  };
  let sem = current;
  for (let k = 0; k < horizon && todo.length; k++) {
    sem = nextSemester(sem, plan.settings.summers);
    const cap = termOf(sem) === "ג" ? Math.min(10, plan.settings.perSemester) : plan.settings.perSemester;
    const feasible = todo.filter((code) => {
      const c = COURSE[code];
      if (!c) return false;
      const o = offerIn(c, sem);
      if (o === "no" || o === "unusual") return false;
      const probe: PlanItem = { code, sem };
      return !itemIssues({ ...work, settings: { ...work.settings, biblioDone: true } }, probe, current).some((x) => x.severity === "error");
    });
    // best subset by weighted credits under the cap (≤ 2^14 subsets)
    const cand = feasible.slice(0, 14);
    let best: string[] = [];
    let bestScore = -1;
    for (let mask = 1; mask < 1 << cand.length; mask++) {
      let cr = 0;
      let score = 0;
      const pick: string[] = [];
      for (let b = 0; b < cand.length; b++)
        if (mask & (1 << b)) {
          const c = COURSE[cand[b]];
          cr += c.credits;
          score += c.credits * weight(cand[b]);
          pick.push(cand[b]);
        }
      if (cr > cap) continue;
      // at most one seminar-level course per semester
      if (pick.filter((p) => COURSE[p].level === "seminar").length > 1) continue;
      if (score > bestScore) {
        bestScore = score;
        best = pick;
      }
    }
    for (const code of best) work.items.push({ code, sem });
    todo = todo.filter((t) => !best.includes(t));
    depth.clear();
  }
  for (const code of todo) work.items.push({ code, sem: null });
  return work;
}

// ─── input cleaning (server) ──────────────────────────────────────────────────

export function cleanPlan(input: unknown): DegreePlan {
  const p = (input ?? {}) as Partial<DegreePlan>;
  const items: PlanItem[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(p.items) ? p.items.slice(0, 80) : []) {
    const code = String((raw as PlanItem)?.code ?? "");
    if (!/^\d{5}$/.test(code) || seen.has(code)) continue;
    seen.add(code);
    const r = raw as PlanItem;
    const grade = (v: unknown) => (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100 ? Math.round(Number(v)) : null);
    const g = grade(r.grade);
    const e = grade(r.expected);
    const cr = Number(r.credits);
    items.push({
      code,
      sem: isSemester(r.sem) ? r.sem : null,
      ...(r.credited ? { credited: true } : {}),
      ...(r.passed ? { passed: true } : {}),
      ...(g !== null ? { grade: g } : {}),
      ...(e !== null ? { expected: e } : {}),
      ...(isSemester(r.failedIn) ? { failedIn: r.failedIn } : {}),
      ...(!COURSE[code] && typeof r.name === "string" ? { name: r.name.slice(0, 80) } : {}),
      ...(!COURSE[code] && Number.isFinite(cr) && cr > 0 && cr <= 12 ? { credits: cr } : {}),
    });
  }
  const recognized: Recognized[] = (Array.isArray(p.recognized) ? p.recognized.slice(0, 10) : [])
    .map((r) => ({
      label: String(r?.label ?? "").slice(0, 80),
      area: (["math", "cs", "science"].includes(r?.area as string) ? r.area : "science") as Recognized["area"],
      credits: Math.max(0, Math.min(60, Math.round(Number(r?.credits) || 0))),
    }))
    .filter((r) => r.credits > 0);
  const s = (p.settings ?? {}) as Partial<PlanSettings>;
  const per = Math.round(Number(s.perSemester));
  const settings: PlanSettings = {
    perSemester: Number.isFinite(per) && per >= 4 && per <= 30 ? per : DEFAULT_SETTINGS.perSemester,
    summers: !!s.summers,
    target: isSemester(s.target) ? s.target : null,
    biblioDone: !!s.biblioDone,
    englishExempt: !!s.englishExempt,
    englishContent: [0, 1, 2].includes(Number(s.englishContent)) ? Number(s.englishContent) : 2,
    gradeTarget: Number(s.gradeTarget) >= 60 && Number(s.gradeTarget) <= 100 ? Math.round(Number(s.gradeTarget)) : 85,
  };
  return { program: "AF", items, recognized, settings };
}

// ─── what-if scenarios ────────────────────────────────────────────────────────

export interface Scenario {
  id: string;
  name: string;
  plan: DegreePlan;
}
export const MAX_SCENARIOS = 5;

export function cleanScenarios(input: unknown): Scenario[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Scenario[] = [];
  for (const raw of input.slice(0, MAX_SCENARIOS)) {
    const r = (raw ?? {}) as Partial<Scenario>;
    const id = String(r.id ?? "");
    if (!/^[a-z0-9]{6,24}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: String(r.name ?? "").trim().slice(0, 40) || "תרחיש", plan: cleanPlan(r.plan) });
  }
  return out;
}

/** What differs between two plans: courses that moved, were added or removed. */
export function planDiff(a: DegreePlan, b: DegreePlan): { code: string; name: string; from: string | null; to: string | null; kind: "moved" | "added" | "removed" }[] {
  const out: ReturnType<typeof planDiff> = [];
  for (const x of a.items) {
    const y = b.items.find((i) => i.code === x.code);
    if (!y) out.push({ code: x.code, name: nameOf(x), from: x.sem, to: null, kind: "removed" });
    else if (y.sem !== x.sem && !x.credited) out.push({ code: x.code, name: nameOf(x), from: x.sem, to: y.sem, kind: "moved" });
  }
  for (const y of b.items) if (!a.items.some((i) => i.code === y.code)) out.push({ code: y.code, name: nameOf(y), from: null, to: y.sem, kind: "added" });
  return out;
}
