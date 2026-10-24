/**
 * Session agenda: 2–4 concrete, tickable steps for a planned study session, built only from data the
 * app already has (where you stopped reading, this week's reading, videos per chapter, due cards,
 * the open assignment questions, the chapter's questions). No AI. Pure, so Today, UpNext and tests agree.
 */
import type { Session } from "@/lib/planner";
import type { ReadingItem } from "@/lib/readings";
import { duration, ltr } from "@/lib/time";

export type StepKind = "read" | "video" | "cards" | "assignment" | "questions";

export interface AgendaStep {
  /** stable within the session, so a tick survives a reload and a changing number ("8 cards" → "6") */
  id: string;
  kind: StepKind;
  text: string;
  href?: string;
  minutes?: number;
}

export interface AgendaVideo {
  id: string;
  title: string;
  minutes: number | null;
  watched: boolean;
}

export interface AssignmentQuestion {
  /** assignment number as the progress table writes it ("01") */
  n: string;
  /** question number inside the assignment */
  q: number;
  status: "todo" | "draft" | "done" | "stuck" | string;
  /** chapters this question needs, when known ("2.1–2.3") */
  material?: string | null;
}

export interface AgendaData {
  /** where to continue in this course (lib/books readingByCourse) */
  reading?: { bookId: string; idx: number; title: string; lastPage: number | null; href: string } | null;
  /** this week's reading in this course (lib/readings weekFor) */
  week?: ReadingItem | null;
  /** the material of the assignment this session prepares (lib/readings assignments) */
  assignmentReading?: ReadingItem | null;
  /** videos for the chapter being read */
  videos?: AgendaVideo[];
  /** practice cards due in this course */
  cardsDue?: number;
  /** open (unanswered) book questions of the chapter being read */
  chapterQuestions?: { chapterId: string; open: number; href: string } | null;
  /** question tracker rows of this course (table assignment_questions), when it exists */
  assignmentQuestions?: AssignmentQuestion[];
  /** "ממ״ן" / "ממ״ח" label of the session's assignment */
  assignmentLabel?: string;
  /** the course page, for assignment steps */
  courseHref?: string;
}

type SessionLike = Pick<Session, "minutes" | "courseCode" | "kind" | "ref" | "title">;

const MAX_STEPS = 4;
const MAX_CARDS = 15;
const QUESTION_MINUTES = 10;

/** "a01-2" → "01" (the planner's assignment ref), else null. */
export function assignmentOf(ref: string | undefined): string | null {
  const m = ref?.match(/^a(\w+?)(?:-\d+)?$/);
  return m ? m[1] : null;
}

export function sessionAgenda(session: SessionLike, d: AgendaData): AgendaStep[] {
  const steps: AgendaStep[] = [];
  const add = (s: AgendaStep) => {
    if (steps.length < MAX_STEPS) steps.push(s);
  };
  const cards = Math.min(d.cardsDue ?? 0, MAX_CARDS);
  const cardsStep = (): AgendaStep | null =>
    cards > 0 ? { id: "cards", kind: "cards", text: cards === 1 ? "כרטיסייה אחת שמחכה" : `${cards} כרטיסיות שמחכות`, href: "/study", minutes: Math.max(3, Math.ceil(cards * 0.75)) } : null;

  if (session.kind === "assignment") {
    const n = assignmentOf(session.ref);
    const open = (d.assignmentQuestions ?? [])
      .filter((q) => q.n === n && q.status !== "done")
      .sort((a, b) => (a.status === "stuck" ? 1 : 0) - (b.status === "stuck" ? 1 : 0) || a.q - b.q);
    const label = d.assignmentLabel ?? "מטלה";
    const nextQ = open[0];
    if (nextQ) {
      const second = open[1] && session.minutes >= 120 ? open[1] : null;
      add({
        id: `q:${n}:${nextQ.q}`,
        kind: "assignment",
        text: `${label} ${n} שאלה ${nextQ.q}${nextQ.status === "draft" ? " (להשלים טיוטה)" : ""}${nextQ.material ? ` · חומר: ${ltr(nextQ.material)}` : ""}`,
        href: d.courseHref,
        minutes: second ? Math.round(session.minutes / 2) : undefined,
      });
      if (second) add({ id: `q:${n}:${second.q}`, kind: "assignment", text: `${label} ${n} שאלה ${second.q}`, href: d.courseHref });
    }
    // Material not read yet comes first when no question is open (or the tracker isn't there).
    const unread = d.assignmentReading?.links.find((l) => !l.done && l.href);
    if (unread && steps.length < 2) add({ id: `read:${unread.href}`, kind: "read", text: `לקרוא לפני: ${unread.title}${unread.note ? `, ${unread.note}` : ""}`, href: unread.href! });
    if (!steps.length && n) add({ id: `a:${n}`, kind: "assignment", text: `לעבוד על ${label} ${n}`, href: d.courseHref });
    const c = cardsStep();
    if (c && steps.length < 3 && session.minutes >= 60) add(c);
    return steps;
  }

  if (session.kind === "exam") {
    const c = cardsStep();
    if (c) add(c);
    if (d.chapterQuestions?.open) add(questionsStep(d.chapterQuestions, 3));
    add({ id: "exam:past", kind: "assignment", text: "שאלה אחת מבחינה קודמת, בזמן", href: d.courseHref, minutes: 30 });
    return steps;
  }

  // Routine study: continue reading, a video for this chapter, the chapter's questions, due cards.
  const r = d.reading;
  const weekLink = d.week?.links.find((l) => !l.done && l.href);
  const videoBudget = session.minutes >= 60;
  const video = videoBudget ? (d.videos ?? []).find((v) => !v.watched && (v.minutes ?? 0) <= session.minutes / 2) : undefined;
  const qs = d.chapterQuestions?.open ? questionsStep(d.chapterQuestions, 2) : null;
  const c = cardsStep();
  const reserved = (video?.minutes ?? 0) + (qs?.minutes ?? 0) + (c?.minutes ?? 0);
  const readMinutes = Math.max(15, session.minutes - reserved);
  if (r) {
    add({
      id: `read:${r.bookId}:${r.idx}`,
      kind: "read",
      text: r.lastPage ? `להמשיך מעמ׳ ${r.lastPage} (${r.title}), כ־${duration(readMinutes)}` : `לקרוא: ${r.title}, כ־${duration(readMinutes)}`,
      href: r.href, // the reader reopens at the saved page
      minutes: readMinutes,
    });
  } else if (weekLink) {
    add({ id: `read:${weekLink.href}`, kind: "read", text: `לקרוא: ${weekLink.title}${weekLink.note ? `, ${weekLink.note}` : ""}`, href: weekLink.href!, minutes: readMinutes });
  }
  if (video) add({ id: `video:${video.id}`, kind: "video", text: `סרטון: ${video.title}${video.minutes ? ` (${duration(video.minutes)})` : ""}`, href: `https://www.youtube.com/watch?v=${video.id}`, minutes: video.minutes ?? undefined });
  if (qs) add(qs);
  if (c) add(c);
  return steps;
}

function questionsStep(q: NonNullable<AgendaData["chapterQuestions"]>, max: number): AgendaStep {
  const k = Math.min(max, q.open);
  return {
    id: `questions:${q.chapterId}`,
    kind: "questions",
    text: k === 1 ? "לענות על שאלה מהפרק" : `לענות על ${k} שאלות מהפרק`,
    href: q.href,
    minutes: k * QUESTION_MINUTES,
  };
}
