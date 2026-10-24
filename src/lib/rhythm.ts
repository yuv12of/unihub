/**
 * The end-of-day check and what Unihub learns from it.
 *
 * Each evening: energy (1–5), what got in the way, and (optionally) when focus was best. After
 * MIN_CHECKS evenings that name a time, the band with the most energy-weighted votes becomes the
 * "best band", and courses are ranked by how often their study gets skipped (plus open stuck points).
 * The planner then gives the best band's routine session to the hardest course. Pure, client-safe.
 */

export type Band = "morning" | "midday" | "afternoon" | "evening";

export const BANDS: { id: Band; label: string; from: number; to: number }[] = [
  { id: "morning", label: "בוקר", from: 5 * 60, to: 11 * 60 },
  { id: "midday", label: "צהריים", from: 11 * 60, to: 14 * 60 },
  { id: "afternoon", label: "אחר הצהריים", from: 14 * 60, to: 17 * 60 + 30 },
  { id: "evening", label: "ערב", from: 17 * 60 + 30, to: 24 * 60 },
];

export const BLOCKERS: { id: string; label: string; tip: string }[] = [
  { id: "tired", label: "עייפות", tip: "אולי לנסות את השינה המאוחרת כשהיא מוצעת, או לשים את החומר הקשה מוקדם יותר." },
  { id: "phone", label: "הטלפון", tip: "טלפון בחדר אחר בזמן מפגש לימוד, וטיימר הפוקוס פתוח." },
  { id: "didnt_get", label: "לא הבנתי את החומר", tip: "לסמן \"נתקעתי\" ולהעביר לשאלה למנחה: ההנחיה הטלפונית בדיוק בשביל זה." },
  { id: "unexpected", label: "משהו לא צפוי", tip: "קורה. התוכנית כבר העבירה את מה שנשאר לימים הבאים." },
  { id: "mood", label: "מצב רוח / לחץ", tip: "יום קשה? אפשר לסמן אותו ככזה, והתוכנית מורידה הילוך בלי לשבור רצפים." },
  { id: "other_tasks", label: "משימות אחרות", tip: "אם זה חוזר, אולי שווה לחסום את הזמן הזה בלוח מראש." },
  { id: "noise", label: "רעש / הפרעות", tip: "אוזניות ומוזיקת פוקוס מהטיימר." },
];

export const ENERGY = [
  { n: 1, label: "מרוקן" },
  { n: 2, label: "עייף" },
  { n: 3, label: "בסדר" },
  { n: 4, label: "טוב" },
  { n: 5, label: "מעולה" },
];

export interface DayCheck {
  date: string;
  energy: number;
  blockers: string[];
  focus_band: Band | null;
  note?: string | null;
}

export interface Rhythm {
  /** the learned best band (null until there are enough checks) */
  best: Band | null;
  /** courses hardest to get through first */
  hard: string[];
  /** checks that named a band (how much the "best" rests on) */
  n: number;
  /** the user turned it off: keep learning, but don't move sessions */
  off?: boolean;
  updated: string;
}

export const MIN_CHECKS = 5;
const WINDOW_DAYS = 42;

const daysBefore = (d: string, n: number) => {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
};

/** Energy-weighted votes per band over the last six weeks. */
export function bandScores(checks: DayCheck[], today: string): Record<Band, number> {
  const from = daysBefore(today, WINDOW_DAYS);
  const s: Record<Band, number> = { morning: 0, midday: 0, afternoon: 0, evening: 0 };
  for (const c of checks) if (c.focus_band && c.date >= from && c.date <= today) s[c.focus_band] += 0.5 + c.energy / 5;
  return s;
}

export function computeRhythm({
  checks,
  sessionRows,
  courses,
  focus,
  today,
  off,
}: {
  checks: DayCheck[];
  /** session_status rows: key "date|kind|code|ref", status done/skipped */
  sessionRows: { session_key: string; status: string }[];
  courses: string[];
  focus?: Record<string, number> | null;
  today: string;
  off?: boolean;
}): Rhythm {
  const from = daysBefore(today, WINDOW_DAYS);
  const voted = checks.filter((c) => c.focus_band && c.date >= from && c.date <= today);
  const scores = bandScores(checks, today);
  const ranked = (Object.entries(scores) as [Band, number][]).sort((a, b) => b[1] - a[1]);
  // a clear winner only: the top band needs at least 1.25× the runner-up
  const best = voted.length >= MIN_CHECKS && ranked[0][1] > 0 && ranked[0][1] >= 1.25 * ranked[1][1] ? ranked[0][0] : null;

  const hardness = new Map<string, number>();
  for (const code of courses) {
    let done = 0;
    let skipped = 0;
    for (const r of sessionRows) {
      const [date, , c] = r.session_key.split("|");
      if (c !== code || date < from || date > today) continue;
      if (r.status === "done") done++;
      else if (r.status === "skipped") skipped++;
    }
    const skipRate = done + skipped >= 3 ? skipped / (done + skipped) : 0;
    hardness.set(code, skipRate + 0.15 * Math.min(3, focus?.[code] ?? 0));
  }
  const hard = [...courses].sort((a, b) => hardness.get(b)! - hardness.get(a)! || courses.indexOf(a) - courses.indexOf(b));
  return { best, hard, n: voted.length, off: off || undefined, updated: today };
}

export const bandOf = (minutes: number): Band => BANDS.find((b) => minutes >= b.from && minutes < b.to)?.id ?? "evening";
export const bandLabel = (b: Band) => BANDS.find((x) => x.id === b)!.label;

/** The most frequent blockers of the last two weeks, with how often. */
export function topBlockers(checks: DayCheck[], today: string, limit = 2) {
  const from = daysBefore(today, 14);
  const count = new Map<string, number>();
  for (const c of checks) if (c.date >= from && c.date <= today) for (const b of c.blockers) count.set(b, (count.get(b) ?? 0) + 1);
  return [...count.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, n]) => ({ ...BLOCKERS.find((b) => b.id === id)!, n }))
    .filter((b) => b.label);
}

/**
 * Give the best band's routine sessions to the hardest courses. Only routine study on future days,
 * only between sessions of the same length on the same day, so times and minutes never change; refs
 * are renumbered per course so keys stay unique ("routine", "routine2").
 */
export function applyRhythm<S extends { date: string; start: string; minutes: number; courseCode: string; kind: string; title: string; ref?: string; why?: string }>(
  sessions: S[],
  rhythm: Rhythm | null | undefined,
  today: string,
  titleFor: (code: string) => string,
): S[] {
  if (!rhythm?.best || rhythm.off || rhythm.hard.length < 2) return sessions;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const rank = (code: string) => {
    const i = rhythm.hard.indexOf(code);
    return i < 0 ? rhythm.hard.length : i;
  };
  const byDay = new Map<string, S[]>();
  for (const s of sessions)
    if (s.date > today && s.kind === "routine" && /^routine\d*$/.test(s.ref ?? "")) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  for (const list of byDay.values()) {
    if (list.length < 2) continue;
    const byLen = new Map<number, S[]>();
    for (const s of list) byLen.set(s.minutes, [...(byLen.get(s.minutes) ?? []), s]);
    for (const group of byLen.values()) {
      if (group.length < 2) continue;
      const inBest = (s: S) => (bandOf(toMin(s.start)) === rhythm.best ? 0 : 1);
      const slots = [...group].sort((a, b) => inBest(a) - inBest(b) || a.start.localeCompare(b.start));
      if (inBest(slots[0]) === 1) continue; // no session of this length in the best band
      const payload = group.map((s) => ({ code: s.courseCode, why: s.why })).sort((a, b) => rank(a.code) - rank(b.code));
      slots.forEach((s, i) => {
        s.courseCode = payload[i].code;
        s.why = payload[i].why;
        s.title = titleFor(payload[i].code);
      });
    }
    // renumber refs per course in time order
    const seen = new Map<string, number>();
    for (const s of [...list].sort((a, b) => a.start.localeCompare(b.start))) {
      const n = (seen.get(s.courseCode) ?? 0) + 1;
      seen.set(s.courseCode, n);
      s.ref = n === 1 ? "routine" : `routine${n}`;
    }
  }
  return sessions;
}
