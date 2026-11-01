/**
 * Registration windows per semester and what to tell the student about them. Pure and client-safe.
 * Published windows from src/data/registration.json; later semesters are estimated from the latest
 * published one of the same term, shifted by whole weeks (registration opens on the same weekday).
 */
import data from "@/data/registration.json";
import { registrationDiff, type SheiltaSnapshot } from "@/lib/sheilta";
import { semLabel, termOf, type DegreePlan } from "@/lib/degree";

export interface RegWindow {
  sem: string;
  regular: [string, string];
  late: [string, string];
  /** after late registration: possible until here if the group has room */
  lastChance: string;
  starts: string;
  ends: string;
  estimated: boolean;
}

type Raw = Omit<RegWindow, "sem" | "estimated">;
const PUBLISHED = data.semesters as unknown as Record<string, Raw>;
export const REGISTRATION_SOURCE = data.source;
export const SHEILTA_REGISTRATION = "https://sheilta.apps.openu.ac.il/CoursesRegistration/pages/GroupsSearch.aspx";

const shift = (iso: string, days: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86_400_000);

export function registrationWindow(sem: string): RegWindow | null {
  const p = PUBLISHED[sem];
  if (p) return { sem, ...p, estimated: false };
  const year = Number(sem.slice(0, 4));
  const base = Object.keys(PUBLISHED)
    .filter((s) => termOf(s) === termOf(sem))
    .sort()
    .at(-1);
  if (!base) return null;
  const years = year - Number(base.slice(0, 4));
  const k = years * 364; // whole weeks, so the weekday stays
  const b = PUBLISHED[base];
  const s = (d: string) => shift(d, k);
  return {
    sem,
    regular: [s(b.regular[0]), s(b.regular[1])],
    late: [s(b.late[0]), s(b.late[1])],
    lastChance: s(b.lastChance),
    starts: s(b.starts),
    ends: s(b.ends),
    estimated: true,
  };
}

export type RegPhase = "before" | "regular" | "late" | "last" | "closed";
export function regPhase(w: RegWindow, today: string): RegPhase {
  if (today < w.regular[0]) return "before";
  if (today <= w.regular[1]) return "regular";
  if (today <= w.late[1]) return "late";
  if (today <= w.lastChance) return "last";
  return "closed";
}

export interface RegistrationState {
  window: RegWindow;
  phase: RegPhase;
  /** days until the current phase ends (or until it opens, for "before") */
  daysLeft: number;
  rows: ReturnType<typeof registrationDiff>["rows"];
  extra: ReturnType<typeof registrationDiff>["extra"];
  missing: number;
  synced: boolean;
}

/**
 * Semesters worth talking about today: registration open (any phase until the last chance), or opening
 * within `soonDays`, and the plan or Sheilta has something there.
 */
export function registrationStates(plan: DegreePlan, snapshot: SheiltaSnapshot | null, today: string, soonDays = 14): RegistrationState[] {
  const sems = new Set<string>();
  for (const i of plan.items) if (i.sem && !i.credited) sems.add(i.sem);
  for (const r of snapshot?.records ?? []) sems.add(r.sem);
  const out: RegistrationState[] = [];
  for (const sem of [...sems].sort()) {
    const w = registrationWindow(sem);
    if (!w) continue;
    const phase = regPhase(w, today);
    if (phase === "closed") continue;
    if (phase === "before" && daysBetween(today, w.regular[0]) > soonDays) continue;
    const { rows, extra } = registrationDiff(plan, snapshot, sem);
    if (!rows.length && !extra.length) continue;
    const end = phase === "before" ? w.regular[0] : phase === "regular" ? w.regular[1] : phase === "late" ? w.late[1] : w.lastChance;
    out.push({ window: w, phase, daysLeft: daysBetween(today, end), rows, extra, missing: rows.filter((r) => r.registered !== true).length, synced: !!snapshot });
  }
  return out;
}

const fmt = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}`;
export const regDate = fmt;

/** One line about where registration stands, for cards and pushes. */
export function phaseLine(s: RegistrationState): string {
  const w = s.window;
  const est = w.estimated ? " (משוער)" : "";
  switch (s.phase) {
    case "before":
      return `ההרשמה ל${semLabel(w.sem)} נפתחת ב־${fmt(w.regular[0])}${est}`;
    case "regular":
      return `ההרשמה ל${semLabel(w.sem)} פתוחה עד ${fmt(w.regular[1])}${est}${s.daysLeft <= 14 ? ` (עוד ${s.daysLeft} ימים)` : ""}`;
    case "late":
      return `הרשמה מאוחרת ל${semLabel(w.sem)} (בתוספת דמי טיפול) עד ${fmt(w.late[1])}${est}`;
    case "last":
      return `אפשר עוד להירשם ל${semLabel(w.sem)} עד ${fmt(w.lastChance)}, רק אם יש מקום בקבוצה`;
    default:
      return "";
  }
}

export interface RegPush {
  key: string;
  title: string;
  body: string;
  url: string;
}

/**
 * Phone reminders (the tick sends each key once): the day registration opens; a week before the
 * regular period ends, its last day, and the last day of late registration — those three only while
 * planned courses aren't registered in Sheilta (or nothing was synced yet). Between 09:30 and 21:00.
 */
export function registrationPushes(plan: DegreePlan, snapshot: SheiltaSnapshot | null, now: { date: string; minutes: number }): RegPush[] {
  if (now.minutes < 9 * 60 + 30 || now.minutes > 21 * 60) return [];
  const out: RegPush[] = [];
  for (const s of registrationStates(plan, snapshot, now.date, 0)) {
    const w = s.window;
    const names = s.rows.filter((r) => r.registered !== true).map((r) => r.name);
    const list = names.join(", ");
    const url = "/degree#registration";
    if (now.date === w.regular[0] && s.rows.length)
      out.push({ key: `reg|${w.sem}|open`, title: `נפתחה ההרשמה ל${semLabel(w.sem)}`, body: `לפי התכנית: ${s.rows.map((r) => r.name).join(", ")}. הרשמה סדירה עד ${fmt(w.regular[1])}.`, url });
    if (!names.length) continue;
    const unsure = s.synced ? "" : " (עוד לא סונכרן משאילתא)";
    if (daysBetween(now.date, w.regular[1]) === 7)
      out.push({ key: `reg|${w.sem}|week`, title: `עוד שבוע נגמרת ההרשמה הסדירה ל${semLabel(w.sem)}`, body: `עוד לא רשום${unsure}: ${list}.`, url });
    if (now.date === w.regular[1])
      out.push({ key: `reg|${w.sem}|last`, title: `היום היום האחרון להרשמה סדירה ל${semLabel(w.sem)}`, body: `מחר מתחילה הרשמה מאוחרת בתוספת דמי טיפול. עוד לא רשום${unsure}: ${list}.`, url });
    if (now.date === w.late[1])
      out.push({ key: `reg|${w.sem}|late`, title: `היום נגמרת ההרשמה המאוחרת ל${semLabel(w.sem)}`, body: `עוד לא רשום${unsure}: ${list}.`, url });
  }
  return out;
}
