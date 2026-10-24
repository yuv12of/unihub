/**
 * Practice logic without the database: which book questions are due, the mixed bag (interleaved
 * questions with "which chapter is this?"), the pretest pick, the next phone-tutoring slot, and
 * the text of a question for the tutor. Pure, so it can be tested.
 */
import { rng } from "./drills/rng";

export interface PracticeQuestion {
  id: string;
  chapter_id: string;
  idx: number;
  prompt: string;
  hint: string | null;
  answer: string;
  page: number | null;
  difficulty: number;
  status: "solved" | "stuck" | "skipped" | null;
  course_code: string;
  chapter_title: string;
  chapter_idx: number;
  book_id: string;
}

export interface PracticeChapter {
  id: string;
  title: string;
  course_code: string;
  /** read_at or done_at set */
  opened: boolean;
}

/** Link to the question's page in the reader (page is within the chapter). */
export const bookHref = (q: { book_id: string; chapter_idx: number; page: number | null }) =>
  `/books/${q.book_id}?ch=${q.chapter_idx}${q.page ? `&p=${q.page}` : ""}`;

/**
 * Book questions due today: from chapters I opened or finished, not solved, and not already
 * answered today (skipped or stuck ones come back tomorrow).
 */
export function dueQuestions<Q extends Pick<PracticeQuestion, "id" | "chapter_id" | "status">>(qs: Q[], opened: Set<string>, answeredToday: Set<string>): Q[] {
  return qs.filter((q) => opened.has(q.chapter_id) && q.status !== "solved" && !answeredToday.has(q.id));
}

export interface MixItem {
  id: string;
  chapter_id: string;
  /** chapter ids to choose from (the right one included), shuffled */
  choices: string[];
}

/**
 * About n questions from opened chapters, spread over chapters and courses (round robin),
 * shuffled, each with 3–4 chapter choices for "which chapter / method is this?". Distractors come
 * from other opened chapters first (same course first), then any chapter that has questions.
 */
export function pickMix(
  qs: { id: string; chapter_id: string; difficulty: number; status?: PracticeQuestion["status"] }[],
  chapters: PracticeChapter[],
  n = 10,
  seed = 1,
): MixItem[] {
  const r = rng(seed);
  const byId = new Map(chapters.map((c) => [c.id, c]));
  const withQs = new Set(qs.map((q) => q.chapter_id));
  const opened = chapters.filter((c) => c.opened && withQs.has(c.id));
  if (!opened.length) return [];
  // unsolved first within each chapter, random order otherwise
  const pools = new Map<string, typeof qs>();
  for (const c of r.shuffle(opened)) {
    const own = r.shuffle(qs.filter((q) => q.chapter_id === c.id));
    pools.set(c.id, [...own.filter((q) => q.status !== "solved"), ...own.filter((q) => q.status === "solved")]);
  }
  // alternate courses, then chapters within them
  const courseOrder = r.shuffle([...new Set(opened.map((c) => c.course_code))]);
  const picked: typeof qs = [];
  let progress = true;
  while (picked.length < n && progress) {
    progress = false;
    for (const code of courseOrder)
      for (const [cid, pool] of pools) {
        if (picked.length >= n) break;
        if (byId.get(cid)?.course_code !== code || !pool.length) continue;
        picked.push(pool.shift()!);
        progress = true;
        break; // one per course per round
      }
    // rotate chapters so the next round takes another chapter of the same course
    const first = [...pools.entries()];
    pools.clear();
    for (const [k, v] of [...first.slice(1), ...first.slice(0, 1)]) pools.set(k, v);
  }
  const candidates = chapters.filter((c) => withQs.has(c.id));
  return r.shuffle(picked).map((q) => {
    const own = byId.get(q.chapter_id)!;
    const others = candidates.filter((c) => c.id !== own.id);
    const rank = (c: PracticeChapter) => (c.opened ? 0 : 2) + (c.course_code === own.course_code ? 0 : 1);
    const sorted = r.shuffle(others).sort((a, b) => rank(a) - rank(b));
    const distractors = sorted.slice(0, 3).map((c) => c.id);
    return { id: q.id, chapter_id: q.chapter_id, choices: r.shuffle([q.chapter_id, ...distractors]) };
  });
}

/** The two questions to try before reading: easiest first, then book order. */
export function pretestPick(qs: { id: string; difficulty: number; idx: number }[], k = 2): string[] {
  return [...qs]
    .sort((a, b) => a.difficulty - b.difficulty || a.idx - b.idx)
    .slice(0, k)
    .map((q) => q.id);
}

export interface PhoneSlot {
  date: string;
  start_time: string | null;
  end_time: string | null;
  /** tutor's name, from "הנחיה טלפונית: <name>" */
  tutor: string;
  phone: string | null;
  course_code: string | null;
}

export const PHONE_PREFIX = "הנחיה טלפונית";

/** The next phone-tutoring hour for a course that hasn't ended yet (dates/times in Israel). */
export function nextPhoneSlot(
  events: { date: string; start_time: string | null; end_time: string | null; title: string; location: string | null; course_code: string | null; cancelled?: boolean }[],
  courseCode: string | null,
  today: string,
  nowHHMM: string,
): PhoneSlot | null {
  const slots = events
    .filter((e) => e.title.startsWith(PHONE_PREFIX) && !e.cancelled && (!courseCode || e.course_code === courseCode))
    .filter((e) => e.date > today || (e.date === today && (e.end_time ?? e.start_time ?? "24:00") > nowHHMM))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  const e = slots[0];
  if (!e) return null;
  return {
    date: e.date,
    start_time: e.start_time,
    end_time: e.end_time,
    tutor: e.title.replace(new RegExp(`^${PHONE_PREFIX}\\s*:?\\s*`), "").trim(),
    phone: e.location?.trim() || null,
    course_code: e.course_code,
  };
}

/** "052-7575513" → "tel:0527575513" */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

export interface TutorDraft {
  courseName: string;
  courseCode: string | null;
  topic: string;
  tried: string;
  whereStuck: string;
  /** absolute link to the book page, when known */
  bookLink?: string | null;
}

/** The question as plain text: a subject line and a body, for the forum or a mail. */
export function tutorQuestionText(d: TutorDraft): { subject: string; body: string } {
  const subject = `שאלה ב${d.courseName}${d.courseCode ? ` (${d.courseCode})` : ""}: ${d.topic}`.slice(0, 140);
  const lines = [
    `נושא: ${d.topic}`,
    d.bookLink ? `מקום בספר: ${d.bookLink}` : "",
    "",
    "מה ניסיתי:",
    d.tried.trim() || "—",
    "",
    "איפה נתקעתי:",
    d.whereStuck.trim() || "—",
    "",
    "תודה!",
  ];
  return { subject, body: lines.filter((l, i) => l !== "" || i > 0).join("\n").replace(/\n{3,}/g, "\n\n") };
}

export const mailtoHref = (t: { subject: string; body: string }) =>
  `mailto:?subject=${encodeURIComponent(t.subject)}&body=${encodeURIComponent(t.body)}`;
