/** Minimal iCalendar (RFC 5545) writer for the Unihub feed. */

export interface CalEvent {
  uid: string;
  title: string;
  description?: string;
  /** All-day event on this date (YYYY-MM-DD)… */
  date?: string;
  /** …or a timed event in Israel time. */
  start?: { date: string; time: string };
  end?: { date: string; time: string };
  reminderMinutes?: number;
}

const TZ = "Asia/Jerusalem";

// Israel time zone definition (DST from the Friday before the last Sunday of March to the last Sunday of October).
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZ}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0300",
  "TZNAME:IDT",
  "DTSTART:19700327T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=FR;BYMONTHDAY=23,24,25,26,27,28,29",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0300",
  "TZOFFSETTO:+0200",
  "TZNAME:IST",
  "DTSTART:19701025T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const d8 = (iso: string) => iso.replaceAll("-", "");
const t6 = (hhmm: string) => hhmm.replace(":", "") + "00";

/** Fold lines at 75 octets without splitting a UTF-8 character. */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + b > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function renderCalendar(name: string, events: CalEvent[], stamp: Date = new Date()): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Unihub//Study planner//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(name)}`,
    `X-WR-TIMEZONE:${TZ}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    ...VTIMEZONE,
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${dtstamp}`, `SUMMARY:${escape(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escape(e.description)}`);
    if (e.start && e.end) {
      lines.push(`DTSTART;TZID=${TZ}:${d8(e.start.date)}T${t6(e.start.time)}`);
      lines.push(`DTEND;TZID=${TZ}:${d8(e.end.date)}T${t6(e.end.time)}`);
    } else if (e.date) {
      const next = new Date(e.date + "T00:00:00Z");
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${d8(e.date)}`, `DTEND;VALUE=DATE:${d8(next.toISOString().slice(0, 10))}`);
      lines.push("TRANSP:TRANSPARENT");
    }
    if (e.reminderMinutes != null) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escape(e.title)}`,
        `TRIGGER:-PT${e.reminderMinutes}M`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
