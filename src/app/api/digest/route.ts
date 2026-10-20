import { connection } from "next/server";
import { bearer, loadPrivate } from "@/lib/privateFeed";
import { academicEvents, academicOn } from "@/lib/academic";
import { nextExams, minutesLabel } from "@/lib/planner";
import { progressKey } from "@/lib/progress";
import {
  allDeadlines,
  daysBetween,
  formatHebrewDate,
  relativeDays,
  semester,
  typeLabel, themeOf } from "@/lib/semester";

import { APP, COLORS, esc, row, section, table } from "@/lib/emailHtml";

/** Morning email for the Apps Script to send to the user's own inbox. */
export async function POST(req: Request) {
  await connection();
  const token = bearer(req);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  const data = await loadPrivate(token);
  if (!data) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { feed, progress, exams, today, sessions, courses } = data;

  const todays = sessions.filter((s) => s.date === today);
  const events = feed.events
    .filter((e) => e.date === today)
    .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  const deadlines = allDeadlines(today, courses).filter((d) => {
    const st = progress[progressKey(d.course.code, d.n)]?.status;
    return d.daysLeft >= 0 && d.daysLeft <= 7 && st !== "submitted" && st !== "skipped";
  });
  const exam = nextExams(exams, today)[0];
  const academic = academicOn(today);
  const nextAcademic = academicEvents.find((e) => e.date > today);


  const parts: string[] = [];
  const timeline = [
    ...events.map((e) => ({
      t: e.start_time ?? "",
      html: row(
        e.course_code ? themeOf(courses, e.course_code).hex : "#5d6880",
        (e.cancelled ? "<s>" : "") + esc(e.title) + (e.cancelled ? "</s> (בוטל)" : ""),
        e.start_time ? `\u2066${e.start_time}–${e.end_time ?? ""}\u2069${e.location ? ` · ${esc(e.location)}` : ""}` : "כל היום",
      ),
    })),
    ...todays.map((s) => ({
      t: s.start,
      html: row(themeOf(courses, s.courseCode).hex, esc(s.title), `\u2066${s.start}–${s.end}\u2069 · ${minutesLabel(s.minutes)}`),
    })),
  ].sort((a, b) => a.t.localeCompare(b.t));
  parts.push(section("היום", timeline.length ? table(timeline.map((x) => x.html)) : `<p style="color:#5d6880">אין לימוד או מפגשים מתוכננים להיום.</p>`));

  if (deadlines.length)
    parts.push(
      section(
        "הגשות בשבוע הקרוב",
        table(
          deadlines.map((d) =>
            row(
              themeOf(courses, d.course.code).hex,
              `${typeLabel[d.type]} ${d.n} ב${themeOf(courses, d.course.code).short}`,
              `${formatHebrewDate(d.due, { weekday: "long", day: "numeric", month: "numeric" })} · ${relativeDays(d.daysLeft)} · משקל ${d.weight}`,
            ),
          ),
        ),
      ),
    );

  if (exam) {
    const name = courses.find((c) => c.code === exam.course_code)?.name ?? exam.course_code;
    parts.push(
      section(
        "בחינה קרובה",
        `<p style="margin:0">${esc(name)}, מועד ${exam.moed}: <b>${relativeDays(daysBetween(today, exam.date))}</b> (${formatHebrewDate(exam.date, { day: "numeric", month: "long" })})</p>`,
      ),
    );
  }

  if (feed.mails.length)
    parts.push(
      section(
        "דואר חדש מהאוניברסיטה",
        feed.mails
          .slice(0, 6)
          .map(
            (m) =>
              `<p style="margin:0 0 10px"><b>${esc(m.subject ?? "")}</b><br><span style="color:#5d6880;font-size:13px">${esc(m.summary ?? "סיכום יתווסף בהמשך.")}</span></p>`,
          )
          .join(""),
      ),
    );

  if (feed.updates_pending > 0)
    parts.push(
      `<p style="margin-top:20px"><a href="${APP}" style="color:#2f5bd3">${feed.updates_pending} עדכונים מהדואר מחכים לאישור</a></p>`,
    );

  if (feed.cards_due > 0)
    parts.push(
      `<p style="margin-top:20px"><a href="${APP}/study" style="color:#2f5bd3">${feed.cards_due} כרטיסי תרגול מחכים לחזרה</a></p>`,
    );

  const banner = academic.length
    ? academic.map((a) => a.title).join(", ")
    : nextAcademic
      ? `${nextAcademic.title} ${relativeDays(daysBetween(today, nextAcademic.date))}`
      : "";
  const dateLine = formatHebrewDate(today, { weekday: "long", day: "numeric", month: "long" });
  const subject = `Unihub · ${dateLine}${deadlines[0] && deadlines[0].daysLeft <= 2 ? ` · ${typeLabel[deadlines[0].type]} ${deadlines[0].n} ${relativeDays(deadlines[0].daysLeft)}` : ""}`;

  const html = `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#16213a">
<p style="color:#5d6880;margin:0">${esc(dateLine)}</p>
<h1 style="font-size:24px;margin:4px 0 6px">בוקר טוב</h1>
${banner ? `<p style="margin:0;color:#5d6880">🎓 ${esc(banner)}</p>` : ""}
${parts.join("\n")}
<p style="margin-top:26px"><a href="${APP}" style="display:inline-block;background:#16213a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">פתיחת Unihub</a></p>
</div>`;
  return Response.json({ subject, html });
}
