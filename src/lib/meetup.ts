/**
 * Meetup mode: from 30 minutes before a tutorial until an hour after it.
 * Pure (client-safe): which meetup is "on" now, and what the live notes mean.
 */

export const MEETUP_LEAD = 30;
export const MEETUP_AFTER = 60;

export type MeetupPhase = "soon" | "live" | "after";

export interface MeetupEvent {
  date: string;
  start_time: string | null;
  end_time: string | null;
  kind: string;
  course_code: string | null;
  cancelled?: boolean;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function meetupPhase(e: MeetupEvent, date: string, nowMin: number): MeetupPhase | null {
  if (e.kind !== "tutorial" || e.cancelled || !e.course_code || !e.start_time || e.date !== date) return null;
  const start = toMin(e.start_time);
  const end = e.end_time ? toMin(e.end_time) : start + 120;
  if (nowMin < start - MEETUP_LEAD || nowMin >= end + MEETUP_AFTER) return null;
  return nowMin < start ? "soon" : nowMin < end ? "live" : "after";
}

/** The meetup that is on now (the one starting first, if two overlap). */
export function currentMeetup<E extends MeetupEvent>(events: E[], date: string, nowMin: number): { event: E; phase: MeetupPhase } | null {
  const on = events
    .map((event) => ({ event, phase: meetupPhase(event, date, nowMin) }))
    .filter((x): x is { event: E; phase: MeetupPhase } => !!x.phase)
    .sort((a, b) => a.event.start_time!.localeCompare(b.event.start_time!));
  // a meetup that is live beats one that ended or hasn't started
  return on.find((x) => x.phase === "live") ?? on.find((x) => x.phase === "soon") ?? on[0] ?? null;
}

export const meetupHref = (code: string, date: string) => `/meetup/${code}/${date}`;

/** Markers you can type at the start of a note line (or insert from the toolbar). */
export const MARK_Q = "❓";
export const MARK_EXAM = "⭐";

/** "❓ ..." lines: what wasn't clear (offered as stuck points at the end). */
export const questionLines = (body: string) =>
  body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith(MARK_Q))
    .map((l) => l.slice(MARK_Q.length).trim())
    .filter(Boolean);

/** "⭐ ..." lines: things the tutor said matter for the exam. */
export const examLines = (body: string) =>
  body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith(MARK_EXAM))
    .map((l) => l.slice(MARK_EXAM.length).trim())
    .filter(Boolean);

/** "[0:42]" = 42 minutes into the meetup: the same mark finds the spot in the recording later. */
export function stamp(startTime: string, nowMin: number): string {
  const m = Math.max(0, nowMin - toMin(startTime));
  return `[${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}]`;
}

/** The math keys of the note toolbar. */
export const MATH_KEYS = ["∑", "√", "≤", "≥", "≠", "∈", "⊆", "∪", "∩", "→", "⇔", "∞", "λ", "α", "ε", "δ", "^", "_"];
