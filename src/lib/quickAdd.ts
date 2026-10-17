/**
 * One-line quick add, in Hebrew, without AI:
 *   "אימון מחר 18:00 עם ספיר"  ·  "ארוחה עם המשפחה שישי ב-20"  ·  "רופא שיניים 3/11 10:30 חצי שעה"
 * Understands a day (today, tomorrow, a weekday, a date), a time or a time range, a length,
 * and "עם <names>" matched against the people you're connected with.
 */
export interface QuickParse {
  title: string;
  date: string;
  start: string | null;
  end: string | null;
  invite: { id: string; name: string }[];
  unknown: string[];
  dateLabel: string;
}

const DAYS: [RegExp, number][] = [
  [/ראשון/, 0],
  [/שני(?!ם|יה)/, 1],
  [/שלישי/, 2],
  [/רביעי/, 3],
  [/חמישי/, 4],
  [/שישי/, 5],
  [/שבת/, 6],
];

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
const toMin = (h: string, m?: string) => Number(h) * 60 + Number(m ?? 0);
const realDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
};

export function parseQuick(input: string, today: string, people: { id: string; name: string }[]): QuickParse {
  let text = ` ${input.trim()} `;
  const cut = (re: RegExp) => {
    text = text.replace(re, " ");
  };

  // --- people: "עם ספיר ודנה", "עם ספיר, דנה" (stop at a day/time word)
  const invite: QuickParse["invite"] = [];
  const unknown: string[] = [];
  const withM = text.match(/\sעם\s+([^\d:]+?)(?=\s(?:היום|מחר|מחרתיים|ב?יום|ב?ראשון|ב?שני|ב?שלישי|ב?רביעי|ב?חמישי|ב?שישי|ב?שבת|ב?שעה|ב-?\d{1,2}(?::\d{2})?|מ-?\d{1,2}(?::\d{2})?|עד)(?=\s|$)|\s\d|\s*$)/);
  if (withM) {
    const names = withM[1].split(/\s*(?:,|\sו)\s*/).map((s) => s.trim()).filter(Boolean);
    let matchedAny = false;
    const find = (n: string) => people.find((x) => x.name.split(" ")[0] === n || x.name === n || x.name.split(" ")[0].startsWith(n));
    for (const raw of names) {
      // "ודנה" means "and Dana", but "ורד" is a name: try it as written first.
      const p = find(raw) ?? (raw.startsWith("ו") && raw.length > 2 ? find(raw.slice(1)) : undefined);
      const n = raw;
      if (p) {
        matchedAny = true;
        if (!invite.some((i) => i.id === p.id)) invite.push({ id: p.id, name: p.name.split(" ")[0] });
      } else unknown.push(n);
    }
    // Only take "עם …" out of the title when it named people ("ארוחה עם המשפחה" stays as is).
    if (matchedAny) cut(/\sעם\s+[^\d:]+?(?=\s(?:היום|מחר|מחרתיים|ב?יום|ב?ראשון|ב?שני|ב?שלישי|ב?רביעי|ב?חמישי|ב?שישי|ב?שבת|ב?שעה|ב-?\d{1,2}(?::\d{2})?|מ-?\d{1,2}(?::\d{2})?|עד)(?=\s|$)|\s\d|\s*$)/);
    else unknown.length = 0;
  }

  // --- length
  let len = 60;
  const lenRules: [RegExp, (m: RegExpMatchArray) => number][] = [
    [/\sחצי\sשעה(?=\s)/, () => 30],
    [/\sשעה\sוחצי(?=\s)/, () => 90],
    [/\sשעתיים(?=\s)/, () => 120],
    [/\s(\d+)\s?(?:דקות|דק['׳]?)(?=\s)/, (m) => Number(m[1])],
    [/\s(\d+(?:\.\d)?)\s?שעות(?=\s)/, (m) => Math.round(Number(m[1]) * 60)],
    [/\sשעה(?=\s)/, () => 60],
  ];
  for (const [re, f] of lenRules) {
    const m = text.match(re);
    if (m) {
      len = f(m);
      cut(re);
      break;
    }
  }
  // --- day
  let date = today;
  let dateLabel = "היום";
  let dateFound = false;
  const dm = text.match(/\s(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s)/);
  if (dm) {
    let y = dm[3] ? Number(dm[3]) : Number(today.slice(0, 4));
    if (y < 100) y += 2000;
    let iso = `${y}-${pad(Number(dm[2]))}-${pad(Number(dm[1]))}`;
    if (!dm[3] && iso < today) iso = `${y + 1}-${pad(Number(dm[2]))}-${pad(Number(dm[1]))}`;
    if (realDate(iso)) {
      dateFound = true;
      date = iso;
      dateLabel = `${Number(dm[1])}/${Number(dm[2])}`;
      cut(/\s\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?(?=\s)/);
    }
  }
  if (dateFound) {
    // a date like 3/11 was given
  } else if (/\sמחרתיים\s/.test(text)) {
    date = addDays(today, 2);
    dateLabel = "מחרתיים";
    cut(/\sמחרתיים(?=\s)/);
  } else if (/\sמחר\s/.test(text)) {
    date = addDays(today, 1);
    dateLabel = "מחר";
    cut(/\sמחר(?=\s)/);
  } else if (/\sהיום\s/.test(text)) {
    cut(/\sהיום(?=\s)/);
  } else {
    for (const [re, wd] of DAYS) {
      // Not "ארוחת שבת" / "ליל שישי": there the day is part of the title.
      const full = new RegExp(`(?<!(?:ארוחת|קבלת|ליל|מוצאי|כניסת|יציאת|צאת|ערב))\\s(?:ב?יום\\s+)?ב?(?:${re.source})(?:\\s+הבא)?(?=\\s)`);
      const m = text.match(full);
      if (m) {
        const cur = new Date(today + "T00:00:00Z").getUTCDay();
        const ahead = (wd - cur + 7) % 7;
        date = addDays(today, ahead === 0 && /הבא/.test(m[0]) ? 7 : ahead);
        dateLabel = date === today ? "היום" : `ב${["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"][wd]}`;
        cut(full);
        break;
      }
    }
  }

  // --- time: "18:00-20:00", "מ-18 עד 20", "ב-18:30", "18:30", "בשעה 9", "עד 20:00"
  let start: number | null = null;
  let end: number | null = null;
  let hadColon = false;
  const range = text.match(/\s(?:מ-?|מה?שעה\s)?(\d{1,2})(?::(\d{2}))?\s*(?:-|–|עד)\s*(\d{1,2})(?::(\d{2}))?(?=\s)/);
  if (range && Number(range[1]) < 24 && Number(range[3]) < 24) {
    start = toMin(range[1], range[2]);
    end = toMin(range[3], range[4]);
    hadColon = !!range[2];
    cut(/\s(?:מ-?|מה?שעה\s)?\d{1,2}(?::\d{2})?\s*(?:-|–|עד)\s*\d{1,2}(?::\d{2})?(?=\s)/);
  } else {
    const t = text.match(/\s(?:ב-?|בשעה\s)?(\d{1,2}):(\d{2})(?=\s)/) ?? text.match(/\s(?:ב-|בשעה\s|ב)(\d{1,2})(?=\s)/);
    if (t && Number(t[1]) < 24) {
      start = toMin(t[1], t[2]);
      hadColon = !!t[2];
      cut(t[2] ? /\s(?:ב-?|בשעה\s)?\d{1,2}:\d{2}(?=\s)/ : /\s(?:ב-|בשעה\s|ב)\d{1,2}(?=\s)/);
    }
  }
  // Afternoon guess: "ב-6" for an evening plan means 18:00 (but "6:30" is taken as written).
  if (start != null && start < 7 * 60 && !hadColon) start += 12 * 60;

  if (start != null && end == null) end = Math.min(start + len, 23 * 60 + 59);
  // "18-20" → 18:00-20:00 already; "6-8" in the evening → 18:00-20:00; past midnight stops at 23:59.
  if (start != null && end != null && end <= start) end = start >= 12 * 60 ? 23 * 60 + 59 : Math.min(end + 12 * 60, 23 * 60 + 59);

  const title = text.replace(/\s+/g, " ").replace(/^[\s,–-]+|[\s,–-]+$/g, "").trim();
  return {
    title: title || "אירוע",
    date,
    start: start == null ? null : hhmm(start),
    end: end == null ? null : hhmm(end),
    invite,
    unknown,
    dateLabel,
  };
}
