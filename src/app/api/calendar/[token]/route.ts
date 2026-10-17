import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl, supabaseEnabled } from "@/lib/supabase/config";
import { defaultPrefs, sessionKey, type Exam, type StudyPrefs } from "@/lib/planner";
import { academicEvents } from "@/lib/academic";
import { coursesFor, progressKey, type ProgressMap, type Status } from "@/lib/progress";
import { occurrencesFor, planFor } from "@/lib/planfor";
import type { Routine, RoutineLog } from "@/lib/routines";
import { restFor } from "@/lib/hebcal";
import { renderCalendar, type CalEvent } from "@/lib/ical";
import { courseFromRow, semester, todayInIsrael, typeLabel, addDays, themeOf, type CourseRow } from "@/lib/semester";

interface FeedData {
  routines?: Routine[];
  routine_logs?: RoutineLog[];
  off_days?: string[];
  prefs: StudyPrefs | null;
  courses?: CourseRow[];
  progress: { course_code: string; semester: string; n: string; status: Status; due_override?: string | null }[];
  exams: (Exam & { semester: string })[];
  events?: { id: string; date: string; start_time: string | null; end_time: string | null; title: string; kind: string; location: string | null; cancelled?: boolean; external_id?: string | null; source?: string }[];
  session_status?: Record<string, "done" | "skipped">;
  session_minutes?: Record<string, number>;
}

/** Private iCal feed, fetched by Google Calendar without a login; the token is the key. */
export async function GET(_req: Request, ctx: RouteContext<"/api/calendar/[token]">) {
  await connection();
  const { token } = await ctx.params;
  if (!supabaseEnabled || !/^[0-9a-f]{48}$/.test(token)) return new Response("Not found", { status: 404 });

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("calendar_feed", { p_token: token });
  if (error || !data) return new Response("Not found", { status: 404 });
  const feed = data as FeedData;

  const progress: ProgressMap = Object.fromEntries(
    feed.progress
      .filter((p) => p.semester === semester.semester)
      .map((p) => [progressKey(p.course_code, p.n), { status: p.status, grade: null, due: p.due_override ?? null }]),
  );
  const exams = feed.exams.filter((e) => e.semester === semester.semester);
  const today = todayInIsrael();
  const userEvents = feed.events ?? [];
  const status = feed.session_status ?? {};
  const rows = Object.entries(status).map(([session_key, st]) => ({ session_key, status: st, minutes: feed.session_minutes?.[session_key] ?? null }));
  const base = (feed.courses ?? []).map(courseFromRow);
  const courses = coursesFor(progress, base);
  const routines = feed.routines ?? [];
  const rest = await restFor(feed.prefs?.jewish, addDays(today, -60), addDays(today, 240));
  const offDays = [...(feed.off_days ?? []), ...rest.offDays];
  const plan = planFor({ today, prefs: feed.prefs ?? defaultPrefs, progress, exams, events: userEvents, rows, courses: base, routines, offDays, extraBusy: rest.busy });

  const events: CalEvent[] = [];
  for (const c of courses) {
    for (const a of c.assignments) {
      if (a.due < addDays(today, -60)) continue;
      const status = progress[progressKey(c.code, a.n)]?.status;
      const mark = status === "submitted" ? "✓ " : status === "skipped" ? "✗ " : "";
      events.push({
        uid: `due-${c.code}-${semester.semester}-${a.n}@unihub`,
        title: `${mark}הגשה: ${typeLabel[a.type]} ${a.n} ב${themeOf(courses, c.code).short}`,
        description: `${c.name}, משקל ${a.weight}${a.originalDue ? ` (הוארך, במקור ${a.originalDue.split("-").reverse().join("/")})` : ""}`,
        date: a.due,
      });
    }
  }
  for (const e of exams) {
    const name = courses.find((c) => c.code === e.course_code)?.name ?? e.course_code;
    const title = `בחינה: ${name}, מועד ${e.moed}`;
    if (e.start_time) {
      const [h, m] = e.start_time.split(":").map(Number);
      const end = `${String(Math.min(23, h + 3)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      events.push({
        uid: `exam-${e.course_code}-${semester.semester}-${e.moed}@unihub`,
        title,
        start: { date: e.date, time: e.start_time },
        end: { date: e.date, time: end },
        reminderMinutes: 24 * 60,
      });
    } else {
      events.push({ uid: `exam-${e.course_code}-${semester.semester}-${e.moed}@unihub`, title, date: e.date });
    }
  }
  for (const e of userEvents) {
    if (e.source === "google") continue; // came from the user's Google Calendar; sending it back would duplicate it
    if (e.kind === "other" && e.start_time) continue; // phone tutoring hours stay in the app, not the calendar
    const title = e.cancelled ? `בוטל: ${e.title}` : e.title;
    // Opal events are re-imported on every sync, so their identity comes from Opal, not the row id.
    const uid = e.external_id ? `ext-${e.external_id.replace(/[^\w.-]/g, "").slice(0, 120)}@unihub` : `event-${e.id}@unihub`;
    events.push(
      e.start_time && e.end_time
        ? {
            uid,
            title,
            description: e.location ?? undefined,
            start: { date: e.date, time: e.start_time },
            end: { date: e.date, time: e.end_time },
          }
        : { uid, title, date: e.date },
    );
  }
  for (const a of academicEvents) {
    if ((a.end ?? a.date) < addDays(today, -60)) continue;
    const days = a.end ? Math.round((Date.parse(a.end) - Date.parse(a.date)) / 86_400_000) + 1 : 1;
    for (let i = 0; i < days; i++) {
      const d = addDays(a.date, i);
      if (days > 10 && i !== 0 && i !== days - 1) continue;
      events.push({ uid: `academic-${d}-${i}@unihub`, title: `🎓 ${a.title}`, date: d });
    }
  }
  for (const s of plan.sessions) {
    const st = status[sessionKey(s)];
    if (st === "skipped") continue;
    events.push({
      uid: `study-${s.date}-${s.start.replace(":", "")}@unihub`,
      title: st === "done" ? `✓ ${s.title}` : s.title,
      start: { date: s.date, time: s.start },
      end: { date: s.date, time: s.end },
      reminderMinutes: 15,
    });
  }

  // Routines with a time (sleep and meals stay in the app), two weeks back to three weeks ahead.
  for (const o of occurrencesFor({ routines, logs: feed.routine_logs ?? [], events: userEvents, plan, today, from: addDays(today, -14), to: addDays(today, 21), offDays })) {
    if (!o.start || !o.end || o.category === "sleep" || o.category === "meal") continue;
    events.push({
      uid: `routine-${o.routineId}-${o.date}@unihub`,
      title: `${o.done ? "✓ " : ""}${o.emoji} ${o.title}`,
      start: { date: o.date, time: o.start },
      end: { date: o.end < o.start ? addDays(o.date, 1) : o.date, time: o.end },
    });
  }

  return new Response(renderCalendar("Unihub", events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=900",
      "Content-Disposition": 'inline; filename="unihub.ics"',
    },
  });
}
