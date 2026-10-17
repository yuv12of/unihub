/**
 * Google Calendar → Unihub, through the calendar's private iCal address ("Secret address in iCal
 * format"). Read-only, no Google permissions needed. Repeating events are expanded here (daily,
 * weekly, monthly, yearly; COUNT/UNTIL/EXDATE and moved single occurrences).
 * Unihub → Google is the existing subscription feed (/api/calendar/[token]), which skips these
 * events so nothing comes back twice.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayInIsrael } from "@/lib/semester";

export function isGoogleIcsUrl(url: string) {
  return /^https:\/\/calendar\.google\.com\/calendar\/ical\/[^/?#]+\/private-[0-9a-f]+\/basic\.ics$/.test(url.trim());
}

type Prop = { value: string; params: string };
interface RawEvent {
  props: Record<string, Prop>;
  exdates: string[];
}

function unfold(text: string): RawEvent[] {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: RawEvent[] = [];
  let cur: RawEvent | null = null;
  let depth = 0; // skip nested VALARM blocks
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = { props: {}, exdates: [] };
      depth = 0;
    } else if (line === "END:VEVENT" && cur) {
      out.push(cur);
      cur = null;
    } else if (cur && line.startsWith("BEGIN:")) depth++;
    else if (cur && line.startsWith("END:")) depth--;
    else if (cur && depth === 0) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [name, ...params] = line.slice(0, i).split(";");
      const prop = { value: line.slice(i + 1), params: params.join(";") };
      const key = name.toUpperCase();
      if (key === "EXDATE") for (const v of prop.value.split(",")) cur.exdates.push(v);
      else cur.props[key] = prop;
    }
  }
  return out;
}

const unescape = (v: string) => v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const WD = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

interface Instance {
  date: string;
  start: string | null;
  end: string | null;
  days: number; // all-day span
}

function parseRule(rule: string) {
  const r: Record<string, string> = {};
  for (const part of rule.split(";")) {
    const [k, v] = part.split("=");
    if (k && v) r[k.toUpperCase()] = v;
  }
  return r;
}

const IL = "Asia/Jerusalem";

/** Offset (ms) of a time zone from UTC at instant t. Unknown zones count as Israel. */
function zoneOffset(t: number, tz: string): number {
  if (tz === "UTC") return 0;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(t));
  } catch {
    return tz === IL ? 0 : zoneOffset(t, IL);
  }
  const g = (k: string) => Number(parts.find((x) => x.type === k)!.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute")) - (t - (t % 60_000));
}

/** Wall-clock date + time in a zone → UTC milliseconds. */
function zonedToUtc(date: string, time: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let t = wall - zoneOffset(wall, tz);
  t = wall - zoneOffset(t, tz); // second pass settles DST edges
  return t;
}

function utcToIsrael(t: number): { date: string; min: number } {
  const local = t + zoneOffset(t, IL);
  const d = new Date(local);
  return { date: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** A DATE or DATE-TIME as written in the file, with the zone it's written in. */
function rawDT(p: Prop | undefined) {
  if (!p) return null;
  const m = p.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(?:\d{2})?(Z)?)?/);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4] || /VALUE=DATE(?!-)/.test(p.params)) return { date, time: null as string | null, tz: IL };
  const tzid = p.params.match(/TZID="?([^";:]+)"?/)?.[1];
  return { date, time: `${m[4]}:${m[5]}`, tz: m[6] ? "UTC" : (tzid ?? IL) };
}

/** Does date d match the rule (ignoring COUNT/UNTIL)? Dates are in the event's own zone. */
function matches(rule: Record<string, string>, start: string, d: string) {
  const interval = Math.max(1, Number(rule.INTERVAL ?? 1));
  const diffDays = dayNum(d) - dayNum(start);
  const [sy, sm, sd] = start.split("-").map(Number);
  const [y, m, day] = d.split("-").map(Number);
  const byday = rule.BYDAY?.split(",") ?? [];
  switch (rule.FREQ) {
    case "DAILY":
      return diffDays % interval === 0;
    case "WEEKLY": {
      // Weeks start on WKST (Monday unless the rule says otherwise, as in RFC 5545).
      const wkst = Math.max(0, WD.indexOf(rule.WKST ?? "MO"));
      const weekOf = (x: string) => dayNum(x) - ((weekday(x) - wkst + 7) % 7);
      const weeks = Math.round((weekOf(d) - weekOf(start)) / 7);
      if (weeks % interval) return false;
      return byday.length ? byday.some((b) => b.slice(-2) === WD[weekday(d)]) : weekday(d) === weekday(start);
    }
    case "MONTHLY": {
      const months = (y - sy) * 12 + (m - sm);
      if (months % interval) return false;
      if (rule.BYMONTHDAY) return rule.BYMONTHDAY.split(",").map(Number).includes(day);
      if (byday.length) {
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        return byday.some((b) => {
          const mm = b.match(/^(-?\d)?([A-Z]{2})$/);
          if (!mm || mm[2] !== WD[weekday(d)]) return false;
          if (!mm[1]) return true;
          const n = Number(mm[1]);
          return n > 0 ? Math.ceil(day / 7) === n : Math.ceil((lastDay - day + 1) / 7) === -n;
        });
      }
      return day === sd;
    }
    case "YEARLY":
      return (y - sy) % interval === 0 && m === sm && day === sd;
    default:
      return false;
  }
}

/** The Israel date of an occurrence that starts on `date` (in the event's zone): used to match moved occurrences. */
function israelDayOf(start: NonNullable<ReturnType<typeof rawDT>>, date: string) {
  return start.time ? utcToIsrael(zonedToUtc(date, start.time, start.tz)).date : date;
}

function instancesOf(ev: RawEvent, from: string, to: string, skip: Set<string> = new Set()): Instance[] {
  const s = rawDT(ev.props.DTSTART);
  if (!s) return [];
  const e = rawDT(ev.props.DTEND);
  let lengthMs = 60 * 60_000;
  let days = 1;
  if (s.time && e?.time) lengthMs = Math.max(0, zonedToUtc(e.date, e.time, e.tz) - zonedToUtc(s.date, s.time, s.tz));
  else if (!s.time && e) days = Math.max(1, Math.min(14, dayNum(e.date) - dayNum(s.date)));
  else if (ev.props.DURATION) {
    const m = ev.props.DURATION.value.match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/);
    if (m) {
      const min = Number(m[1] ?? 0) * 7 * 1440 + Number(m[2] ?? 0) * 1440 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
      if (s.time) lengthMs = min * 60_000;
      else days = Math.max(1, Math.min(14, Math.round(min / 1440)));
    }
  }

  /** One occurrence (date in the event's zone) → Israel-time pieces, one per day it covers. */
  const make = (date: string): Instance[] => {
    if (!s.time) return [{ date, start: null, end: null, days }];
    const a = zonedToUtc(date, s.time, s.tz);
    const startIL = utcToIsrael(a);
    const endIL = utcToIsrael(a + lengthMs);
    const out: Instance[] = [];
    for (let d = startIL.date, i = 0; d <= endIL.date && i < 14; d = addDays(d, 1), i++) {
      const from = d === startIL.date ? startIL.min : 0;
      const until = d === endIL.date ? endIL.min : 23 * 60 + 59;
      if (until > from || (d === startIL.date && lengthMs === 0)) out.push({ date: d, start: toTime(from), end: toTime(Math.max(from, until)), days: 1 });
    }
    return out;
  };

  const rrule = ev.props.RRULE?.value;
  if (!rrule) return make(s.date).filter((x) => addDays(x.date, x.days - 1) >= from && x.date <= to);

  const rule = parseRule(rrule);
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  // UNTIL: a date (inclusive) or an instant.
  const untilRaw = rule.UNTIL?.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  const untilDate = untilRaw ? `${untilRaw[1]}-${untilRaw[2]}-${untilRaw[3]}` : null;
  const untilMs = untilRaw?.[4] ? (untilRaw[7] ? Date.UTC(+untilRaw[1], +untilRaw[2] - 1, +untilRaw[3], +untilRaw[4], +untilRaw[5], +(untilRaw[6] ?? 0)) : zonedToUtc(untilDate!, `${untilRaw[4]}:${untilRaw[5]}`, s.tz)) : null;
  const ex = new Set(
    ev.exdates
      .map((x) => {
        const r = rawDT({ value: x, params: ev.props.DTSTART.params });
        if (!r) return null;
        // An exception written in UTC: find its date in the event's own zone.
        if (/Z$/.test(x) && s.time && s.tz !== "UTC") {
          const t = Date.UTC(+x.slice(0, 4), +x.slice(4, 6) - 1, +x.slice(6, 8), +x.slice(9, 11), +x.slice(11, 13));
          return new Date(t + zoneOffset(t, s.tz)).toISOString().slice(0, 10);
        }
        return r.date;
      })
      .filter(Boolean) as string[],
  );

  const out: Instance[] = [];
  let n = 0;
  // Without COUNT there's no need to walk from the first occurrence years ago: start near the window.
  const begin = count === Infinity ? (s.date > addDays(from, -15) ? s.date : addDays(from, -15)) : s.date;
  const lastDay = untilDate && untilDate < addDays(to, 1) ? untilDate : addDays(to, 1);
  for (let d = begin, guard = 0; d <= lastDay && n < count && guard < 20000; d = addDays(d, 1), guard++) {
    if (!matches(rule, s.date, d)) continue;
    if (untilMs != null && s.time && zonedToUtc(d, s.time, s.tz) > untilMs) break;
    n++;
    if (ex.has(d) || skip.has(israelDayOf(s, d))) continue;
    for (const piece of make(d)) if (addDays(piece.date, piece.days - 1) >= from && piece.date <= to) out.push(piece);
  }
  return out;
}

export interface GoogleRow {
  date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  kind: "custom" | "other";
  location: string | null;
  external_id: string;
}

/** Google's iCal text → Unihub event rows for the window (a month back, six months ahead). */
export function googleToRows(text: string, today = todayInIsrael()): GoogleRow[] {
  const from = addDays(today, -30);
  const to = addDays(today, 180);
  const raw = unfold(text);
  // Single occurrences that were moved or cancelled: "uid|original date" → the new version.
  const moved = new Map<string, Set<string>>();
  for (const ev of raw) {
    const r = rawDT(ev.props["RECURRENCE-ID"]);
    if (!r) continue;
    const uid = ev.props.UID?.value ?? "";
    const d = r.time ? utcToIsrael(zonedToUtc(r.date, r.time, r.tz)).date : r.date;
    moved.set(uid, (moved.get(uid) ?? new Set()).add(d));
  }
  const rows: GoogleRow[] = [];
  const push = (ev: RawEvent, inst: Instance) => {
    if (ev.props.STATUS?.value === "CANCELLED") return;
    const title = unescape(ev.props.SUMMARY?.value ?? "") || "(ללא כותרת)";
    const free = ev.props.TRANSP?.value === "TRANSPARENT";
    for (let i = 0; i < inst.days; i++) {
      const date = addDays(inst.date, i);
      if (date < from || date > to) continue;
      rows.push({
        date,
        start_time: inst.start,
        end_time: inst.end,
        title: title.slice(0, 200),
        // Timed, "busy" events block study time; all-day and "free" ones are just shown.
        kind: inst.start && inst.end && inst.end > inst.start && !free ? "custom" : "other",
        location: unescape(ev.props.LOCATION?.value ?? "").slice(0, 200) || null,
        external_id: `gcal:${(ev.props.UID?.value ?? title).slice(0, 150)}:${date}${inst.start ? `T${inst.start}` : ""}`,
      });
    }
  };
  for (const ev of raw) {
    if (ev.props["RECURRENCE-ID"]) {
      const { RRULE: _drop, ...props } = ev.props;
      for (const inst of instancesOf({ ...ev, props }, from, to)) push(ev, inst);
      continue;
    }
    // Occurrences that were moved or cancelled are replaced by their own entries above.
    for (const inst of instancesOf(ev, from, to, ev.props.RRULE ? moved.get(ev.props.UID?.value ?? "") : undefined)) push(ev, inst);
  }
  // Same id twice (rare) would break the unique key; keep the first.
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.external_id) && seen.add(r.external_id)).slice(0, 2000);
}

/** Fetches one user's Google Calendar and replaces their imported events. */
export async function syncGoogleFor(sb: SupabaseClient, userId: string, url: string): Promise<{ ok: boolean; count?: number; message?: string }> {
  const note = (fields: Record<string, unknown>) => sb.from("external_feeds").update({ last_synced_at: new Date().toISOString(), ...fields }).match({ user_id: userId, kind: "google" });
  let text: string;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    text = await res.text();
    if (!res.ok || !text.includes("BEGIN:VCALENDAR")) throw new Error(res.status === 404 ? "הקישור כבר לא פעיל" : `Google answered ${res.status}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "fetch failed";
    await note({ last_status: `שגיאה: ${message}`.slice(0, 300) });
    return { ok: false, message };
  }
  const rows = googleToRows(text).map((r) => ({ ...r, user_id: userId, source: "google", course_code: null, cancelled: false }));
  const del = await sb.from("user_events").delete().match({ user_id: userId, source: "google" });
  if (del.error) return { ok: false, message: del.error.message };
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("user_events").insert(rows.slice(i, i + 500));
    if (error) {
      await note({ last_status: `שגיאה: ${error.message}`.slice(0, 300) });
      return { ok: false, message: error.message };
    }
  }
  await note({ last_status: "ok", last_count: rows.length });
  return { ok: true, count: rows.length };
}

/** Called from the 10-minute tick: refreshes the Google calendars that are oldest, a few per run. */
export async function syncDueGoogle(admin: SupabaseClient, limit = 4) {
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data } = await admin
    .from("external_feeds")
    .select("user_id, url, last_synced_at")
    .eq("kind", "google")
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  let n = 0;
  for (const f of data ?? []) if ((await syncGoogleFor(admin, f.user_id, f.url)).ok) n++;
  return n;
}
