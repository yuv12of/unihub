import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl, supabaseEnabled } from "@/lib/supabase/config";
import { buildPlan, defaultPrefs, type Exam, type StudyPrefs } from "@/lib/planner";
import { progressKey, type ProgressMap, type Status } from "@/lib/progress";
import { renderCalendar, type CalEvent } from "@/lib/ical";
import { courseTheme, semester, todayInIsrael, typeLabel, addDays } from "@/lib/semester";

interface FeedData {
  prefs: StudyPrefs | null;
  progress: { course_code: string; semester: string; n: string; status: Status }[];
  exams: (Exam & { semester: string })[];
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
      .map((p) => [progressKey(p.course_code, p.n), { status: p.status, grade: null }]),
  );
  const exams = feed.exams.filter((e) => e.semester === semester.semester);
  const today = todayInIsrael();
  const plan = buildPlan({ today, prefs: feed.prefs ?? defaultPrefs, progress, exams });

  const events: CalEvent[] = [];
  for (const c of semester.courses) {
    for (const a of c.assignments) {
      if (a.due < addDays(today, -60)) continue;
      const status = progress[progressKey(c.code, a.n)]?.status;
      const mark = status === "submitted" ? "✓ " : status === "skipped" ? "✗ " : "";
      events.push({
        uid: `due-${c.code}-${semester.semester}-${a.n}@unihub`,
        title: `${mark}הגשה: ${typeLabel[a.type]} ${a.n} ב${courseTheme[c.code].short}`,
        description: `${c.name}, משקל ${a.weight}`,
        date: a.due,
      });
    }
  }
  for (const e of exams) {
    const name = semester.courses.find((c) => c.code === e.course_code)?.name ?? e.course_code;
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
  for (const s of plan.sessions) {
    events.push({
      uid: `study-${s.date}-${s.start.replace(":", "")}@unihub`,
      title: s.title,
      start: { date: s.date, time: s.start },
      end: { date: s.date, time: s.end },
      reminderMinutes: 15,
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
