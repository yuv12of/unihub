import { Suspense } from "react";
import { jewishDays, jewishPrefs } from "@/lib/hebcal";
import Link from "next/link";
import { connection } from "next/server";
import { SemesterCalendar, type CalItem } from "@/components/SemesterCalendar";
import { progressKey } from "@/lib/progress";
import { getNames, getPeople, getUserPlan } from "@/lib/userdata";
import { occurrencesFor } from "@/lib/planfor";
import { CATEGORY } from "@/lib/routines";
import { addDays } from "@/lib/semester";
import { sessionKey } from "@/lib/planner";
import { academicByDay } from "@/lib/academic";
import { supabaseEnabled } from "@/lib/supabase/config";
import { semester, todayInIsrael, typeLabel, themeOf } from "@/lib/semester";

export default function SemesterPage() {
  return (
    <>
      <h1 className="font-display text-4xl">לוח שנה</h1>
      <p className="mt-2 text-ink-soft">
        הגשות, בחינות, הלוח האקדמי ומפגשי הלימוד שלך. לחצו על יום כדי לסמן מפגש כבוצע או להוסיף אירוע.
      </p>
      <Suspense fallback={<div className="mt-8 h-[36rem] animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Semester />
      </Suspense>
    </>
  );
}

async function Semester() {
  await connection();
  const today = todayInIsrael();
  const [{ progress, exams, plan, events, status, courses, routines, logs, offDays, manualOff, prefs }, people] = await Promise.all([getUserPlan(today), getPeople()]);
  const connected = people.filter((p) => p.i_follow === "accepted" || p.follows_me === "accepted");
  const names = await getNames([...events.flatMap((e) => (e.guests ?? []).map((g) => g.invitee)), ...events.map((e) => e.invited_by ?? "").filter(Boolean)]);

  const items: CalItem[] = [];
  for (const c of courses) {
    const theme = themeOf(courses, c.code);
    for (const a of c.assignments) {
      const status = progress[progressKey(c.code, a.n)]?.status;
      items.push({
        date: a.due,
        kind: "due",
        color: theme.color,
        label: `${typeLabel[a.type]} ${a.n} ב${theme.short}${a.originalDue ? " (הוארך)" : ""}`,
        done: status === "submitted" || status === "skipped",
      });
    }
  }
  for (const e of exams) {
    const theme = themeOf(courses, e.course_code);
    items.push({
      date: e.date,
      kind: "exam",
      color: theme.color,
      label: `בחינה ב${theme.short}, מועד ${e.moed}`,
      start: e.start_time ?? undefined,
      end: e.start_time ? `${String(Math.min(23, Number(e.start_time.slice(0, 2)) + 3)).padStart(2, "0")}${e.start_time.slice(2)}` : undefined,
    });
  }
  for (const s of plan.sessions) {
    const key = sessionKey(s);
    items.push({
      date: s.date,
      kind: "study",
      color: themeOf(courses, s.courseCode).color,
      label: s.title,
      start: s.start,
      end: s.end,
      minutes: s.minutes,
      sessionKey: key,
      status: status[key],
    });
  }
  for (const ev of events) {
    items.push({
      date: ev.date,
      kind: ev.kind === "tutorial" ? "tutorial" : "event",
      color: ev.course_code ? themeOf(courses, ev.course_code).color : "var(--ink-soft)",
      label: (ev.cancelled ? "בוטל: " : "") + (ev.location ? `${ev.title} (${ev.location})` : ev.title),
      done: ev.cancelled,
      note: ev.invited_by
        ? `הזמנה מ${names[ev.invited_by]?.name ?? "חבר/ה"}`
        : ev.guests?.length
          ? `עם ${ev.guests.map((g) => `${names[g.invitee]?.name.split(" ")[0] ?? "?"}${g.status === "accepted" ? " ✓" : g.status === "declined" ? " ✕" : " ?"}`).join(", ")}`
          : undefined,
      start: ev.start_time ?? undefined,
      end: ev.end_time ?? undefined,
      eventId: ev.id,
      deletable: ev.source === "manual" && !ev.invited_by,
      ...(ev.source === "google" && { note: "מיומן Google" }),
    });
  }
  // Routines: four weeks back to ten weeks ahead (sleep stays out of the calendar).
  for (const o of occurrencesFor({ routines, logs, events, plan, today, from: addDays(today, -28), to: addDays(today, 70), offDays })) {
    if (o.category === "sleep") continue;
    items.push({
      date: o.date,
      kind: "routine",
      color: CATEGORY[o.category].color,
      label: `${o.emoji} ${o.title}`,
      start: o.start ?? undefined,
      end: o.start && o.end && o.end > o.start ? o.end : undefined,
      done: o.done,
    });
  }
  const jp = jewishPrefs(prefs.jewish);
  if (jp.show)
    for (const d of Object.values(await jewishDays(jp, addDays(today, -28), addDays(today, 200)))) {
      for (const h of d.holidays) items.push({ date: d.date, kind: "academic", color: "var(--ink-soft)", label: `✡ ${h.title}`, holiday: h.major && d.rest });
      if (d.candles) items.push({ date: d.date, kind: "academic", color: "var(--ink-soft)", label: `🕯️ הדלקת נרות ${d.candles}` });
      if (d.havdalah) items.push({ date: d.date, kind: "academic", color: "var(--ink-soft)", label: `✨ הבדלה ${d.havdalah}${d.parasha ? ` · ${d.parasha}` : ""}` });
    }
  for (const a of academicByDay()) {
    items.push({ date: a.date, kind: "academic", color: "var(--ink-soft)", label: a.title, holiday: a.holiday });
  }

  return (
    <div className="mt-8">
      <SemesterCalendar
        items={items}
        today={today}
        editable={supabaseEnabled}
        people={connected.map((p) => ({ id: p.id, name: p.name }))}
        offDays={manualOff}
        legend={courses.map((c) => ({ color: themeOf(courses, c.code).color, label: c.name }))}
      />
      {exams.length === 0 && (
        <p className="mt-4 text-sm text-ink-soft">
          מועדי הבחינות עוד לא הוזנו.{" "}
          <Link href="/settings" className="underline underline-offset-4 decoration-rule hover:text-ink">
            להוספה בהגדרות
          </Link>
        </p>
      )}
    </div>
  );
}
