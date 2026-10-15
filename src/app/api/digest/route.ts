import { connection } from "next/server";
import { bearer, loadPrivate } from "@/lib/privateFeed";
import { academicEvents, academicOn } from "@/lib/academic";
import { nextExams, minutesLabel } from "@/lib/planner";
import { progressKey } from "@/lib/progress";
import {
  allDeadlines,
  courseTheme,
  daysBetween,
  formatHebrewDate,
  relativeDays,
  semester,
  typeLabel,
} from "@/lib/semester";

const APP = "https://unihub-beta.vercel.app";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Fixed hex colours: email clients don't support CSS variables.
const COLORS: Record<string, string> = { "20109": "#2f5bd3", "20474": "#12855a", "20407": "#8a3fc7" };

/** Morning email for the Apps Script to send to the user's own inbox. */
export async function POST(req: Request) {
  await connection();
  const token = bearer(req);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  const data = await loadPrivate(token);
  if (!data) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { feed, progress, exams, today, sessions } = data;

  const todays = sessions.filter((s) => s.date === today);
  const events = feed.events
    .filter((e) => e.date === today)
    .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  const deadlines = allDeadlines(today).filter((d) => {
    const st = progress[progressKey(d.course.code, d.n)]?.status;
    return d.daysLeft >= 0 && d.daysLeft <= 7 && st !== "submitted" && st !== "skipped";
  });
  const exam = nextExams(exams, today)[0];
  const academic = academicOn(today);
  const nextAcademic = academicEvents.find((e) => e.date > today);

  const row = (color: string, main: string, sub: string) =>
    `<tr><td style="width:4px;background:${color};border-radius:2px"></td><td style="padding:6px 10px"><div style="font-size:15px;color:#16213a">${main}</div><div style="font-size:12px;color:#5d6880">${sub}</div></td></tr>`;
  const section = (title: string, body: string) =>
    `<h2 style="font-size:16px;margin:22px 0 8px;color:#16213a">${title}</h2>${body}`;
  const table = (rows: string[]) => `<table style="border-collapse:separate;border-spacing:0 6px;width:100%">${rows.join("")}</table>`;

  const parts: string[] = [];
  const timeline = [
    ...events.map((e) => ({
      t: e.start_time ?? "",
      html: row(
        e.course_code ? COLORS[e.course_code] ?? "#5d6880" : "#5d6880",
        esc(e.title),
        e.start_time ? `${e.start_time}–${e.end_time ?? ""}${e.location ? ` · ${esc(e.location)}` : ""}` : "כל היום",
      ),
    })),
    ...todays.map((s) => ({
      t: s.start,
      html: row(COLORS[s.courseCode] ?? "#5d6880", esc(s.title), `${s.start}–${s.end} · ${minutesLabel(s.minutes)}`),
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
              COLORS[d.course.code],
              `${typeLabel[d.type]} ${d.n} ב${courseTheme[d.course.code].short}`,
              `${formatHebrewDate(d.due, { weekday: "long", day: "numeric", month: "numeric" })} · ${relativeDays(d.daysLeft)} · משקל ${d.weight}`,
            ),
          ),
        ),
      ),
    );

  if (exam) {
    const name = semester.courses.find((c) => c.code === exam.course_code)?.name ?? exam.course_code;
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
