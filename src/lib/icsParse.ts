/** Minimal iCalendar reader for Opal's (Moodle) calendar export. */
import { semester } from "@/lib/semester";

export interface IcsEvent {
  uid: string;
  summary: string;
  description: string;
  location: string;
  categories: string;
  start: { date: string; time: string | null };
  end: { date: string; time: string | null } | null;
}

const unescape = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

/** "20261025T150000Z" → Israel date/time; "20261025" → all-day. */
function toLocal(value: string, params: string): { date: string; time: string | null } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4] || /VALUE=DATE(?!-)/.test(params)) return { date, time: null };
  if (!m[7]) return { date, time: `${m[4]}:${m[5]}` }; // floating / TZID local time: take as given
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${String(Number(get("hour")) % 24).padStart(2, "0")}:${get("minute")}` };
}

export function parseIcs(text: string): IcsEvent[] {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: IcsEvent[] = [];
  let cur: Record<string, { value: string; params: string }> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT" && cur) {
      const start = cur.DTSTART && toLocal(cur.DTSTART.value, cur.DTSTART.params);
      if (start)
        out.push({
          uid: cur.UID?.value ?? "",
          summary: unescape(cur.SUMMARY?.value ?? ""),
          description: unescape(cur.DESCRIPTION?.value ?? ""),
          location: unescape(cur.LOCATION?.value ?? ""),
          categories: unescape(cur.CATEGORIES?.value ?? ""),
          start,
          end: cur.DTEND ? toLocal(cur.DTEND.value, cur.DTEND.params) : null,
        });
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [name, ...params] = line.slice(0, i).split(";");
      cur[name.toUpperCase()] = { value: line.slice(i + 1), params: params.join(";") };
    }
  }
  return out;
}

/** Opal events → Unihub events. Meetings count as tutorials (they block study time); the rest are notes on the day. */
export function opalToEvents(events: IcsEvent[], today: string) {
  const from = new Date(Date.parse(today) - 30 * 86_400_000).toISOString().slice(0, 10);
  return events
    .filter((e) => e.start.date >= from && e.summary.trim())
    .map((e) => {
      const code = e.categories.match(/\b(\d{5})\b/)?.[1] ?? e.summary.match(/\b(\d{5})\b/)?.[1] ?? null;
      const course = semester.courses.find((c) => c.code === code)?.code ?? null;
      const timed = e.start.time && e.end?.time && e.end.date === e.start.date && e.end.time > e.start.time;
      const meeting = /מפגש|הנחיה|תרגול|הרצאה|וובינר|zoom|זום/i.test(e.summary);
      return {
        uid: `opal:${e.uid}`,
        date: e.start.date,
        start: e.start.time,
        end: timed ? e.end!.time : null,
        title: e.summary.trim().slice(0, 200),
        kind: timed && meeting ? "tutorial" : "other",
        course_code: course,
        location: e.location.trim().slice(0, 200) || null,
      };
    })
    .slice(0, 500);
}

/** Only Opal's own calendar export address is accepted. */
export function isOpalExportUrl(url: string) {
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" && u.hostname === "opal.openu.ac.il" && u.pathname === "/calendar/export_execute.php" && u.searchParams.has("authtoken");
  } catch {
    return false;
  }
}
