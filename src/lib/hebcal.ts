/**
 * Jewish calendar from Hebcal (free, no key): holidays, Rosh Chodesh, candle lighting, havdalah and
 * the weekly parasha, Israel schedule. Optional "rest mode": no study planned and no reminders on
 * Shabbat and Yom Tov, and nothing planned after candle lighting on the evening before.
 */
import { cacheLife } from "next/cache";
import type { Busy } from "@/lib/planner";

export const CITIES = [
  { key: "jerusalem", label: "ירושלים", lat: 31.7683, lng: 35.2137, b: 40 },
  { key: "tel-aviv", label: "תל אביב", lat: 32.0853, lng: 34.7818, b: 20 },
  { key: "haifa", label: "חיפה", lat: 32.794, lng: 34.9896, b: 30 },
  { key: "beer-sheva", label: "באר שבע", lat: 31.252, lng: 34.7915, b: 20 },
  { key: "rishon", label: "ראשון לציון", lat: 31.973, lng: 34.7925, b: 20 },
  { key: "petah-tikva", label: "פתח תקווה", lat: 32.0871, lng: 34.8875, b: 20 },
  { key: "netanya", label: "נתניה", lat: 32.3215, lng: 34.8532, b: 20 },
  { key: "ashdod", label: "אשדוד", lat: 31.8044, lng: 34.655, b: 20 },
  { key: "modiin", label: "מודיעין", lat: 31.8969, lng: 35.0095, b: 20 },
  { key: "rehovot", label: "רחובות", lat: 31.8928, lng: 34.8113, b: 20 },
  { key: "kfar-saba", label: "כפר סבא", lat: 32.175, lng: 34.9069, b: 20 },
  { key: "herzliya", label: "הרצליה", lat: 32.1663, lng: 34.8433, b: 20 },
  { key: "nazareth", label: "נצרת", lat: 32.6996, lng: 35.3035, b: 20 },
  { key: "tiberias", label: "טבריה", lat: 32.7959, lng: 35.531, b: 20 },
  { key: "eilat", label: "אילת", lat: 29.5577, lng: 34.9519, b: 20 },
] as const;
export type CityKey = (typeof CITIES)[number]["key"];

export interface JewishPrefs {
  /** show holidays and Rosh Chodesh */
  show: boolean;
  /** also show candle lighting, havdalah and the parasha */
  times: boolean;
  /** no study and no reminders on Shabbat and Yom Tov */
  rest: boolean;
  city: CityKey;
}
export const defaultJewish: JewishPrefs = { show: true, times: false, rest: false, city: "jerusalem" };

export function jewishPrefs(p: unknown): JewishPrefs {
  const o = (p ?? {}) as Partial<JewishPrefs>;
  return {
    show: o.show ?? defaultJewish.show,
    times: o.times ?? defaultJewish.times,
    rest: o.rest ?? defaultJewish.rest,
    city: CITIES.some((c) => c.key === o.city) ? (o.city as CityKey) : defaultJewish.city,
  };
}

export interface JewishDay {
  date: string;
  holidays: { title: string; major: boolean }[];
  candles?: string;
  havdalah?: string;
  parasha?: string;
  /** Shabbat or Yom Tov */
  rest: boolean;
}

interface HebcalItem {
  date: string;
  category: string;
  subcat?: string;
  yomtov?: boolean;
  title: string;
  hebrew?: string;
}

const dayOf = (iso: string) => iso.slice(0, 10);
const timeOf = (iso: string) => iso.slice(11, 16);

/**
 * Hebcal events for a whole Gregorian year and city, cached for a day. A failure (Hebcal down or
 * slower than 3 s) is cached too, but only for minutes, so pages don't wait on it on every view.
 */
async function hebcalYear(city: CityKey, year: number): Promise<HebcalItem[]> {
  "use cache";
  const c = CITIES.find((x) => x.key === city) ?? CITIES[0];
  const q = new URLSearchParams({
    v: "1",
    cfg: "json",
    maj: "on",
    min: "on",
    mod: "on",
    nx: "on",
    ss: "on",
    mf: "on",
    c: "on",
    s: "on",
    i: "on",
    M: "on",
    geo: "pos",
    latitude: String(c.lat),
    longitude: String(c.lng),
    tzid: "Asia/Jerusalem",
    b: String(c.b),
    year: String(year),
  });
  try {
    const res = await fetch(`https://www.hebcal.com/hebcal?${q}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`Hebcal ${res.status}`);
    const json = (await res.json()) as { items?: HebcalItem[] };
    if (!json.items?.length) throw new Error("Hebcal: no items");
    cacheLife("days");
    return json.items;
  } catch (e) {
    console.error(`[hebcal ${year}]`, e instanceof Error ? e.message : e);
    cacheLife("minutes");
    return [];
  }
}

async function hebcalYearSafe(city: CityKey, year: number): Promise<HebcalItem[]> {
  try {
    return await hebcalYear(city, year);
  } catch {
    return [];
  }
}

/** Day-by-day Jewish calendar between two dates (inclusive). */
export async function jewishDays(prefs: JewishPrefs, from: string, to: string): Promise<Record<string, JewishDay>> {
  if (!prefs.show && !prefs.times && !prefs.rest) return {};
  const years = new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]);
  const items = (await Promise.all([...years].map((y) => hebcalYearSafe(prefs.city, y)))).flat();
  const out: Record<string, JewishDay> = {};
  const get = (date: string) => (out[date] ??= { date, holidays: [], rest: new Date(`${date}T12:00:00Z`).getUTCDay() === 6 });
  for (const it of items) {
    const date = dayOf(it.date);
    if (date < from || date > to) continue;
    const name = it.hebrew || it.title;
    switch (it.category) {
      case "candles":
        get(date).candles = timeOf(it.date);
        break;
      case "havdalah":
        get(date).havdalah = timeOf(it.date);
        break;
      case "parashat":
        get(date).parasha = name;
        break;
      case "holiday":
      case "roshchodesh":
        // Chanukah candle items carry a time; keep the name only.
        if (!get(date).holidays.some((h) => h.title === name)) get(date).holidays.push({ title: name, major: it.subcat === "major" || !!it.yomtov });
        if (it.yomtov) get(date).rest = true;
        break;
      default:
        break; // zmanim etc.
    }
  }
  // Saturdays with nothing else still count as rest days.
  for (let d = from; d <= to; d = nextDay(d)) if (new Date(`${d}T12:00:00Z`).getUTCDay() === 6) get(d);
  return out;
}

function nextDay(d: string) {
  return new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** What rest mode adds to the planner: whole rest days, and busy evenings from candle lighting. */
export function restBlocks(days: Record<string, JewishDay>): { offDays: string[]; busy: Busy[] } {
  const offDays: string[] = [];
  const busy: Busy[] = [];
  for (const d of Object.values(days)) {
    if (d.rest) offDays.push(d.date);
    // Candle lighting on a non-rest day = the evening before Shabbat or a chag.
    if (d.candles && !d.rest) busy.push({ date: d.date, start: subtract(d.candles, 30), end: "23:59" });
  }
  return { offDays, busy };
}

function subtract(t: string, min: number) {
  const [h, m] = t.split(":").map(Number);
  const v = Math.max(0, h * 60 + m - min);
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

/** Rest-mode additions for a user's prefs (empty when rest mode is off). */
export async function restFor(raw: unknown, from: string, to: string) {
  const p = jewishPrefs(raw);
  if (!p.rest) return { offDays: [] as string[], busy: [] as Busy[] };
  return restBlocks(await jewishDays({ ...p, show: true }, from, to));
}
