import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { MeetupRoom, type MeetupData } from "@/components/MeetupRoom";
import { getBooks } from "@/lib/books";
import { getReadings, weekFor } from "@/lib/readings";
import { getCourses } from "@/lib/userdata";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { examLines } from "@/lib/meetup";
import { israelNow } from "@/lib/privateFeed";
import { semester, themeOf, todayInIsrael } from "@/lib/semester";

export default function MeetupPage({ params }: PageProps<"/meetup/[code]/[date]">) {
  return (
    <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
      <Meetup params={params} />
    </Suspense>
  );
}

async function Meetup({ params }: Pick<PageProps<"/meetup/[code]/[date]">, "params">) {
  await connection();
  const { code, date } = await params;
  if (!/^\d{5}$/.test(code) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const courses = await getCourses();
  const course = courses.find((c) => c.code === code);
  if (!course) notFound();
  const theme = themeOf(courses, code);

  const empty = { data: null } as { data: null };
  const sb = supabaseEnabled ? await createClient() : null;
  const [links, events, note, prev, stuck, books] = await Promise.all([
    sb ? sb.from("user_courses").select("live_url, recordings_url, group_label").match({ course_code: code, semester: semester.semester }).maybeSingle() : empty,
    sb
      ? sb.from("user_events").select("date, start_time, end_time, title, cancelled").match({ course_code: code, kind: "tutorial" }).order("date")
      : { data: [] as { date: string; start_time: string | null; end_time: string | null; title: string; cancelled: boolean }[] },
    sb ? sb.from("meetup_notes").select("body, attended, asked, updated_at").match({ course_code: code, date }).maybeSingle() : empty,
    sb ? sb.from("meetup_notes").select("date, body").eq("course_code", code).lt("date", date).order("date", { ascending: false }).limit(1).maybeSingle() : empty,
    sb ? sb.from("stuck_points").select("id, topic, created_at, stuck_questions(tried, where_stuck, book_href)").match({ course_code: code, resolved: false }).order("created_at") : empty,
    getBooks(),
  ]);
  const all = (events.data ?? []).filter((e) => !e.cancelled);
  const event = all.find((e) => e.date === date) ?? null;
  const number = event ? all.filter((e) => e.date <= date).length : null;
  const next = all.find((e) => e.date > date) ?? null;
  const plans = await getReadings(books);
  const week = weekFor(plans.weeks[code], date);
  const now = israelNow();

  const data: MeetupData = {
    code,
    date,
    name: course.name,
    short: theme.short,
    color: theme.color,
    start: event?.start_time ?? null,
    end: event?.end_time ?? null,
    number,
    total: all.length || null,
    nextDate: next?.date ?? null,
    liveUrl: links.data?.live_url ?? null,
    recordingsUrl: links.data?.recordings_url ?? null,
    group: links.data?.group_label ?? null,
    note: note.data?.body ?? "",
    attended: note.data?.attended ?? null,
    asked: note.data?.asked ?? [],
    prevDate: prev.data?.date ?? null,
    prevStars: prev.data ? examLines(prev.data.body).slice(0, 4) : [],
    questions: ((stuck.data ?? []) as unknown as { id: string; topic: string; stuck_questions: { tried: string; where_stuck: string; book_href: string | null } | null }[]).map((s) => ({
      id: s.id,
      topic: s.topic,
      detail: s.stuck_questions?.where_stuck || null,
      href: s.stuck_questions?.book_href ?? null,
    })),
    reading: week ? { label: week.label, links: week.links } : null,
    today: todayInIsrael(),
    nowMin: now.minutes,
    editable: supabaseEnabled,
  };
  return <MeetupRoom data={data} />;
}
