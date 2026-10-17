/**
 * Google Calendar → Unihub, through the calendar's private iCal address ("Secret address in iCal
 * format"). Read-only, no Google permissions needed. Repeating events are expanded here (daily,
 * weekly, monthly, yearly; COUNT/UNTIL/EXDATE and moved single occurrences).
 * Unihub → Google is the existing subscription feed (/api/calendar/[token]), which skips these
 * events so nothing comes back twice.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { toLocal } from "@/lib/icsParse";
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
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
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

/** Does date d match the rule (ignoring COUNT/UNTIL)? */
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
      const weeks = Math.floor((dayNum(d) - weekday(d) - (dayNum(start) - weekday(start))) / 7);
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

function instancesOf(ev: RawEvent, from: string, to: string): Instance[] {
  const s = ev.props.DTSTART && toLocal(ev.props.DTSTART.value, ev.props.DTSTART.params);
  if (!s) return [];
  const e = ev.props.DTEND ? toLocal(ev.props.DTEND.value, ev.props.DTEND.params) : null;
  let length = 60;
  let days = 1;
  if (s.time && e?.time) length = Math.max(0, dayNum(e.date) * 1440 + toMin(e.time) - (dayNum(s.date) * 1440 + toMin(s.time)));
  else if (!s.time && e) days = Math.max(1, Math.min(14, dayNum(e.date) - dayNum(s.date)));
  else if (ev.props.DURATION) {
    const m = ev.props.DURATION.value.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/);
    if (m) length = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  }
  const make = (date: string): Instance => {
    if (!s.time) return { date, start: null, end: null, days };
    const end = Math.min(toMin(s.time) + length, 23 * 60 + 59);
    return { date, start: s.time, end: toTime(end), days: 1 };
  };

  const rrule = ev.props.RRULE?.value;
  if (!rrule) return s.date <= to && addDays(s.date, days - 1) >= from ? [make(s.date)] : [];

  const rule = parseRule(rrule);
  const until = rule.UNTIL ? toLocal(rule.UNTIL, "")?.date ?? to : to;
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const ex = new Set(ev.exdates.map((x) => toLocal(x, ev.props.DTSTART.params)?.date).filter(Boolean) as string[]);
  const out: Instance[] = [];
  let n = 0;
  const last = until < to ? until : to;
  for (let d = s.date, guard = 0; d <= last && n < count && guard < 4000; d = addDays(d, 1), guard++) {
    if (!matches(rule, s.date, d)) continue;
    n++;
    if (d >= from && !ex.has(d)) out.push(make(d));
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
  const moved = new Map<string, RawEvent>();
  for (const ev of raw) {
    const rid = ev.props["RECURRENCE-ID"];
    if (!rid) continue;
    const d = toLocal(rid.value, rid.params)?.date;
    if (d) moved.set(`${ev.props.UID?.value}|${d}`, ev);
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
      for (const inst of instancesOf({ ...ev, props: { ...ev.props, RRULE: undefined as unknown as Prop } }, from, to)) push(ev, inst);
      continue;
    }
    for (const inst of instancesOf(ev, from, to)) {
      if (ev.props.RRULE && moved.has(`${ev.props.UID?.value}|${inst.date}`)) continue; // replaced above
      push(ev, inst);
    }
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
