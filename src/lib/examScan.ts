import type { SupabaseClient } from "@supabase/supabase-js";
import { EXAM_MAIL, parseExamDates } from "@/lib/examMail";
import { semester } from "@/lib/semester";

/**
 * Server-side scan (secret key) for exam dates in recent university mail of every user. Runs in the
 * push tick after PDF attachments got their text, so the Sheilta table attachment is readable.
 * New candidates → one in-app notification per user, which the tick then pushes to the phone.
 */
export async function scanExamMails(admin: SupabaseClient, days = 3): Promise<number> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data: mails, error } = await admin
    .from("mails")
    .select("id, user_id, subject, body_text")
    .gte("received_at", since)
    .ilike("sender", "%openu.ac.il%")
    .or("subject.ilike.%בחינ%,subject.ilike.%מבחן%,subject.ilike.%מועד%,sender.ilike.%opal%")
    .limit(400);
  if (error || !mails?.length) return 0;
  const { data: atts } = await admin.from("mail_attachments").select("mail_id, text_content").in("mail_id", mails.map((m) => m.id)).not("text_content", "is", null);
  const textsOf = new Map<string, string[]>();
  for (const a of atts ?? []) if (a.text_content) textsOf.set(a.mail_id, [...(textsOf.get(a.mail_id) ?? []), a.text_content]);
  const relevant = mails.filter((m) => EXAM_MAIL.test(`${m.subject ?? ""}\n${m.body_text ?? ""}\n${(textsOf.get(m.id) ?? []).join("\n")}`));
  if (!relevant.length) return 0;

  const users = [...new Set(relevant.map((m) => m.user_id as string))];
  const [{ data: uc }, { data: exams }] = await Promise.all([
    admin.from("user_courses").select("user_id, course_code").eq("semester", semester.semester).in("user_id", users),
    admin.from("exams").select("user_id, course_code, date").eq("semester", semester.semester).in("user_id", users),
  ]);
  const known = new Set((exams ?? []).map((e) => `${e.user_id}|${e.course_code}|${e.date}`));
  let added = 0;
  for (const user of users) {
    const courses = (uc ?? []).filter((c) => c.user_id === user).map((c) => c.course_code as string);
    if (!courses.length) continue;
    const rows = relevant
      .filter((m) => m.user_id === user)
      .flatMap((m) => parseExamDates({ subject: m.subject, body_text: m.body_text, attachments: textsOf.get(m.id) }, courses, semester.semester).map((e) => ({ ...e, mail_id: m.id })))
      .filter((e) => !known.has(`${user}|${e.course_code}|${e.date}`))
      .map((e) => ({ user_id: user, semester: semester.semester, ...e }));
    if (!rows.length) continue;
    const { data: fresh, error: insErr } = await admin
      .from("exam_candidates")
      .upsert(rows, { onConflict: "user_id,course_code,semester,moed,date", ignoreDuplicates: true })
      .select("course_code");
    if (insErr || !fresh?.length) continue;
    added += fresh.length;
    const codes = [...new Set(fresh.map((f) => f.course_code as string))];
    await admin.from("notifications").insert({
      user_id: user,
      kind: "exam_dates",
      title: "מועדי הבחינות פורסמו",
      body: `${fresh.length === 1 ? "מועד חדש" : `${fresh.length} מועדים חדשים`} (${codes.join(", ")}). לבדוק ולהוסיף ללוח ב־Unihub.`,
      url: "/",
    });
  }
  return added;
}
