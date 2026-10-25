/**
 * Meetup files: after each meetup, my notes (Notability PDF), the tutor's slides and the recording link.
 * Pure, client-safe parts (kinds, labels, which past meetups still miss files).
 */

export const MEETUP_FILE_KINDS = ["notes", "slides", "recording", "other"] as const;
export type MeetupFileKind = (typeof MEETUP_FILE_KINDS)[number];
export const MEETUP_FILE_MAX = 50 * 1024 * 1024;

export interface MeetupFile {
  id: string;
  kind: MeetupFileKind;
  name: string;
  /** a signed link to open the stored file, or the recording link */
  href: string | null;
  size: number | null;
  isLink: boolean;
  createdAt: string;
}

/** The three things asked for after each meetup, in order. */
export const FILE_SLOTS: { kind: Exclude<MeetupFileKind, "other">; title: string; hint: string }[] = [
  { kind: "notes", title: "ההערות שלי", hint: "ייצוא PDF מ־Notability (שיתוף ← PDF ← שמירה בקבצים) והעלאה מכאן." },
  { kind: "slides", title: "קבצי המנחה", hint: "מצגת, דף תרגילים או פתרונות, כפי שהועלו לאתר הקורס." },
  { kind: "recording", title: "הקלטה", hint: "קישור להקלטה כשהיא עולה, בדרך כלל תוך יום-יומיים." },
];

/** How many days after a meetup the Today card keeps asking for its files. */
export const FILES_ASK_DAYS = 7;

export interface PastMeetup {
  course_code: string;
  date: string;
  end_time: string | null;
  start_time: string | null;
}

/**
 * Meetups that ended in the last FILES_ASK_DAYS days and are still missing files: no notes or slides
 * file yet (a recording alone doesn't count), and not marked "no files".
 */
export function meetupsMissingFiles(
  meetups: PastMeetup[],
  files: { course_code: string; date: string; kind: string }[],
  done: { course_code: string; date: string }[],
  today: string,
  nowMin: number,
  addDays: (d: string, n: number) => string,
): PastMeetup[] {
  const from = addDays(today, -FILES_ASK_DAYS);
  const has = new Set(files.filter((f) => f.kind === "notes" || f.kind === "slides").map((f) => `${f.course_code}|${f.date}`));
  const skip = new Set(done.map((d) => `${d.course_code}|${d.date}`));
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return meetups
    .filter((m) => m.date >= from && m.date <= today)
    .filter((m) => m.date < today || (m.end_time ?? m.start_time) == null || nowMin >= toMin((m.end_time ?? m.start_time)!) + (m.end_time ? 0 : 120))
    .filter((m) => !has.has(`${m.course_code}|${m.date}`) && !skip.has(`${m.course_code}|${m.date}`))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export const fileSize = (n: number | null) =>
  n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))}KB` : `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)}MB`;
