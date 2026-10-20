import { connection } from "next/server";
import { bearer, loadPrivate } from "@/lib/privateFeed";
import { minutesLabel, nextExams } from "@/lib/planner";
import { progressKey, standing } from "@/lib/progress";
import { addDays, allDeadlines, daysBetween, formatHebrewDate, relativeDays, semester, typeLabel, themeOf } from "@/lib/semester";
import { APP, COLORS, GREY, button, esc, muted, page, row, section, table } from "@/lib/emailHtml";

/** Friday email: how the week went and what next week looks like. Sent by the user's Apps Script. */
export async function POST(req: Request) {
  await connection();
  const token = bearer(req);
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
  const data = await loadPrivate(token);
  if (!data) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { feed, progress, exams, today, sessions, plan, courses } = data;

  const weekStart = addDays(today, -6);
  const nextEnd = addDays(today, 7);

  // This week: study done, per course.
  const doneByCourse = new Map<string, number>();
  let doneMin = 0;
  let doneCount = 0;
  let skippedCount = 0;
  for (const [key, st] of Object.entries(feed.session_status)) {
    const [date, , code] = key.split("|");
    if (date < weekStart || date > today) continue;
    if (st === "skipped") skippedCount++;
    if (st !== "done") continue;
    const m = feed.session_minutes?.[key] ?? 0;
    doneMin += m;
    doneCount++;
    doneByCourse.set(code, (doneByCourse.get(code) ?? 0) + m);
  }

  // Next week.
  const nextSessions = sessions.filter((s) => s.date > today && s.date <= nextEnd);
  const plannedByCourse = new Map<string, number>();
  for (const s of nextSessions) plannedByCourse.set(s.courseCode, (plannedByCourse.get(s.courseCode) ?? 0) + s.minutes);
  const plannedMin = nextSessions.reduce((n, s) => n + s.minutes, 0);
  const deadlines = allDeadlines(today, courses).filter((d) => {
    const st = progress[progressKey(d.course.code, d.n)]?.status;
    return d.due > today && d.due <= nextEnd && st !== "submitted" && st !== "skipped";
  });
  const tutorials = feed.events
    .filter((e) => e.kind === "tutorial" && e.date > today && e.date <= nextEnd)
    .sort((a, b) => (a.date + (a.start_time ?? "")).localeCompare(b.date + (b.start_time ?? "")));
  const exam = nextExams(exams, today)[0];

  const parts: string[] = [];
  parts.push(
    section(
      "השבוע שעבר",
      doneCount
        ? `<p style="margin:0">למדת <b>${minutesLabel(doneMin)}</b> ב־${doneCount} מפגשים${skippedCount ? `, ודילגת על ${skippedCount}` : ""}.</p>` +
            table(
              [...doneByCourse.entries()].map(([code, m]) =>
                row(themeOf(courses, code).hex, esc(courses.find((c) => c.code === code)?.name ?? code), minutesLabel(m)),
              ),
            )
        : muted("לא סומנו מפגשי לימוד השבוע. מה שלא נעשה עבר אוטומטית לשבוע הבא."),
    ),
  );

  parts.push(
    section(
      "מצב בקורסים",
      table(
        courses.map((c) => {
          const st = standing(c, progress, today);
          const sub =
            st.needed === 0
              ? `עברת את המינימום (${st.earned}/${c.assignmentWeight.min})`
              : st.atRisk
                ? `<b style="color:#b3261e">חסרות ${st.needed} נקודות ונשארו רק ${st.open}</b>`
                : `${st.earned}/${c.assignmentWeight.min} נקודות חובה, נשארו ${st.open} פתוחות`;
          return row(themeOf(courses, c.code).hex, esc(c.name), `${sub}${st.average != null ? ` · ממוצע ${st.average}` : ""}`);
        }),
      ),
    ),
  );

  parts.push(
    section(
      "השבוע הבא",
      (plannedMin
        ? `<p style="margin:0 0 6px">מתוכננות <b>${minutesLabel(plannedMin)}</b> לימוד: ${[...plannedByCourse.entries()]
            .map(([code, m]) => `${themeOf(courses, code).short} ${minutesLabel(m)}`)
            .join(", ")}.</p>`
        : muted("אין לימוד מתוכנן.")) +
        (deadlines.length || tutorials.length
          ? table([
              ...deadlines.map((d) =>
                row(
                  themeOf(courses, d.course.code).hex,
                  `הגשה: ${typeLabel[d.type]} ${d.n} ב${themeOf(courses, d.course.code).short}`,
                  `${formatHebrewDate(d.due, { weekday: "long", day: "numeric", month: "numeric" })} · משקל ${d.weight}`,
                ),
              ),
              ...tutorials.map((e) =>
                row(
                  e.course_code ? themeOf(courses, e.course_code).hex : GREY,
                  (e.cancelled ? "<s>" : "") + esc(e.title) + (e.cancelled ? "</s> (בוטל)" : ""),
                  `${formatHebrewDate(e.date, { weekday: "long", day: "numeric", month: "numeric" })}${e.start_time ? ` · \u2066${e.start_time}–${e.end_time ?? ""}\u2069` : ""}`,
                ),
              ),
            ])
          : ""),
    ),
  );

  if (plan.warnings.length)
    parts.push(
      section(
        "לא מספיק זמן",
        plan.warnings
          .map((w) => `<p style="margin:0 0 6px">${esc(w.title)}: חסרות ${minutesLabel(w.missingMinutes)}. אפשר להוסיף זמן לימוד בהגדרות.</p>`)
          .join(""),
      ),
    );

  if (exam) {
    const name = courses.find((c) => c.code === exam.course_code)?.name ?? exam.course_code;
    parts.push(section("הבחינה הקרובה", `<p style="margin:0">${esc(name)}, מועד ${exam.moed}: <b>${relativeDays(daysBetween(today, exam.date))}</b></p>`));
  }
  if (feed.updates_pending > 0)
    parts.push(`<p style="margin-top:18px"><a href="${APP}" style="color:#2f5bd3">${feed.updates_pending} עדכונים מהדואר מחכים לאישור</a></p>`);

  const subject = `Unihub · סיכום שבועי · ${minutesLabel(doneMin || 0)} השבוע${deadlines.length ? ` · ${deadlines.length} הגשות בשבוע הבא` : ""}`;
  const html = page(`<p style="color:${GREY};margin:0">${formatHebrewDate(weekStart, { day: "numeric", month: "numeric" })}–${formatHebrewDate(today, { day: "numeric", month: "numeric" })}</p>
<h1 style="font-size:24px;margin:4px 0 6px">סיכום שבועי</h1>
${parts.join("\n")}
${button(APP, "פתיחת Unihub")}`);
  return Response.json({ subject, html });
}
