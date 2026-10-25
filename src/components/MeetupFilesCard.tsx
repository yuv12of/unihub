import Link from "next/link";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getCourses } from "@/lib/userdata";
import { addDays, themeOf } from "@/lib/semester";
import { meetupHref } from "@/lib/meetup";
import { FILES_ASK_DAYS, meetupsMissingFiles } from "@/lib/meetupFiles";
import { Icon } from "@/components/Icon";

const dayLabel = (d: string, today: string) =>
  d === today ? "היום" : d === addDays(today, -1) ? "אתמול" : new Date(d + "T12:00:00Z").toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" });

/** Today: meetups of the last week whose notes / tutor's files weren't saved yet. */
export async function MeetupFilesCard({ today, nowMin }: { today: string; nowMin: number }) {
  if (!supabaseEnabled) return null;
  const sb = await createClient();
  const from = addDays(today, -FILES_ASK_DAYS);
  const [events, files, notes, courses] = await Promise.all([
    sb.from("user_events").select("course_code, date, start_time, end_time, cancelled").eq("kind", "tutorial").gte("date", from).lte("date", today),
    sb.from("meetup_files").select("course_code, date, kind").gte("date", from),
    sb.from("meetup_notes").select("course_code, date").eq("files_done", true).gte("date", from),
    getCourses(),
  ]);
  if (files.error || notes.error) return null; // tables not there yet
  const mine = new Set(courses.map((c) => c.code));
  const meetups = (events.data ?? []).filter((e) => !e.cancelled && e.course_code && mine.has(e.course_code)) as {
    course_code: string;
    date: string;
    start_time: string | null;
    end_time: string | null;
  }[];
  const missing = meetupsMissingFiles(meetups, files.data ?? [], notes.data ?? [], today, nowMin, addDays);
  if (!missing.length) return null;
  return (
    <section className="panel p-4">
      <h2 className="section-title">קבצים ממפגשים</h2>
      <p className="mt-1 text-sm text-ink-soft">ההערות וקבצי המנחה עוד לא נשמרו.</p>
      <ul className="mt-2 space-y-1">
        {missing.slice(0, 4).map((m) => (
          <li key={`${m.course_code}|${m.date}`}>
            <Link href={`${meetupHref(m.course_code, m.date)}#files`} className="flex items-center gap-2 rounded-lg py-1.5 text-sm hover:text-ink">
              <span className="size-2 shrink-0 rounded-full" style={{ background: themeOf(courses, m.course_code).color }} aria-hidden />
              <span>
                {themeOf(courses, m.course_code).short}, {dayLabel(m.date, today)}
              </span>
              <span className="ms-auto flex items-center gap-1 text-ink-soft">
                <Icon name="clip" className="size-3.5" />
                העלאה
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
