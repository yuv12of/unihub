import { cache } from "react";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getBooks, readingByCourse } from "@/lib/books";
import { getReadings, weekFor } from "@/lib/readings";
import { getCourses } from "@/lib/userdata";
import { sessionKey, type Session } from "@/lib/planner";
import { typeLabel } from "@/lib/semester";
import { assignmentOf, sessionAgenda, type AgendaData, type AgendaStep, type AssignmentQuestion, type AgendaVideo } from "@/lib/agenda";

interface Loaded {
  books: Awaited<ReturnType<typeof getBooks>>;
  reading: ReturnType<typeof readingByCourse>;
  readings: Awaited<ReturnType<typeof getReadings>>;
  courses: Awaited<ReturnType<typeof getCourses>>;
  videos: { course_code: string; m: string | null; video_id: string; title: string; minutes: number | null }[];
  watched: Set<string>;
  due: Record<string, number>;
  openQuestions: Record<string, number>;
  assignmentQuestions: (AssignmentQuestion & { course_code: string })[];
  ticks: Set<string>; // "<session key>|<step id>"
}

/** One round of reads for every session agenda on the page (cached per request). */
const load = cache(async (): Promise<Loaded | null> => {
  if (!supabaseEnabled) return null;
  const sb = await createClient();
  const books = await getBooks();
  const reading = readingByCourse(books);
  const chapterIds = Object.values(reading)
    .map((r) => books.find((b) => b.id === r.bookId)?.chapters.find((c) => c.idx === r.idx)?.id)
    .filter((x): x is string => !!x);
  const now = new Date().toISOString();
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const [readings, courses, vids, seen, cards, qs, aq, steps] = await Promise.all([
    getReadings(books),
    getCourses(),
    sb.from("course_videos").select("course_code, m, video_id, title, minutes").order("topic_sort").order("sort"),
    sb.from("video_watched").select("video_id"),
    sb.from("cards").select("course_code").lte("due_at", now),
    chapterIds.length ? sb.from("book_questions").select("chapter_id").in("chapter_id", chapterIds).is("status", null) : Promise.resolve({ data: [] as { chapter_id: string }[] }),
    // Built by the planning work (0021); until it exists this read fails and assignment steps fall back.
    sb.from("assignment_questions").select("*"),
    // Until 0022 is applied this read fails: no ticks.
    sb.from("session_steps").select("session_key, step_id").gte("done_at", since),
  ]);
  const due: Record<string, number> = {};
  for (const c of cards.data ?? []) due[c.course_code] = (due[c.course_code] ?? 0) + 1;
  const openQuestions: Record<string, number> = {};
  for (const q of qs.data ?? []) openQuestions[q.chapter_id] = (openQuestions[q.chapter_id] ?? 0) + 1;
  return {
    books,
    reading,
    readings,
    courses,
    videos: vids.data ?? [],
    watched: new Set((seen.data ?? []).map((r) => r.video_id as string)),
    due,
    openQuestions,
    assignmentQuestions: aq.error ? [] : (aq.data ?? []).map(toQuestion).filter((x): x is AssignmentQuestion & { course_code: string } => !!x),
    ticks: new Set((steps.error ? [] : steps.data ?? []).map((r) => `${r.session_key}|${r.step_id}`)),
  };
});

/** Tolerant read of the planning agent's question rows (column names may differ slightly). */
function toQuestion(r: Record<string, unknown>): (AssignmentQuestion & { course_code: string }) | null {
  const code = String(r.course_code ?? "");
  const n = String(r.n ?? r.assignment ?? "").padStart(2, "0");
  const q = Number(r.q ?? r.question ?? r.idx ?? r.number);
  if (!/^\d{5}$/.test(code) || !Number.isFinite(q)) return null;
  const material = typeof r.material === "string" ? r.material : null;
  return { course_code: code, n, q, status: String(r.status ?? "todo"), material };
}

/** The agenda of one session plus which steps are ticked. Empty when there's nothing concrete to say. */
export async function agendaFor(session: Session): Promise<{ steps: AgendaStep[]; done: string[] }> {
  const L = await load();
  if (!L || !session.courseCode) return { steps: [], done: [] };
  const code = session.courseCode;
  const r = L.reading[code] ?? null;
  const chapterId = r ? L.books.find((b) => b.id === r.bookId)?.chapters.find((c) => c.idx === r.idx)?.id : undefined;
  const videos: AgendaVideo[] = [];
  if (r)
    for (const v of L.videos) {
      if (v.course_code !== code || !v.m) continue;
      try {
        if (new RegExp(v.m).test(r.title)) videos.push({ id: v.video_id, title: v.title, minutes: v.minutes, watched: L.watched.has(v.video_id) });
      } catch {}
    }
  const n = assignmentOf(session.ref);
  const course = L.courses.find((c) => c.code === code);
  const type = n ? course?.assignments.find((a) => a.n === n)?.type : undefined;
  const data: AgendaData = {
    reading: r,
    week: weekFor(L.readings.weeks[code], session.date),
    assignmentReading: n ? (L.readings.assignments[code]?.[n] ?? null) : null,
    videos,
    cardsDue: L.due[code] ?? 0,
    chapterQuestions: chapterId && L.openQuestions[chapterId] ? { chapterId, open: L.openQuestions[chapterId], href: r!.href } : null,
    assignmentQuestions: L.assignmentQuestions.filter((q) => q.course_code === code),
    assignmentLabel: type ? typeLabel[type] : "ממ״ן",
    courseHref: `/courses/${code}`,
  };
  const steps = sessionAgenda(session, data);
  const key = sessionKey(session);
  return { steps, done: steps.filter((s) => L.ticks.has(`${key}|${s.id}`)).map((s) => s.id) };
}
