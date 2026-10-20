import { cache } from "react";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { semester } from "@/lib/semester";

/**
 * Course forum posts, read from the notification emails Opal sends ("הודעה מפורום הקורס ..."),
 * which already arrive in Unihub through the mail script. Body format:
 * "20474-2027a -> פורומים -> פורום חדשות -> <topic> <url> <title> נשלח ע"י: <author> בתאריך <d>, <t> ---- <text>"
 */
export interface ForumPost {
  mailId: string;
  courseCode: string;
  forum: string;
  topic: string;
  url: string | null;
  author: string | null;
  text: string;
  at: string;
  isRead: boolean;
  /** assignment number this post is about ("01"), when it names one */
  assignment: string | null;
}

/** "2027א" -> "2027a" as Opal writes it. */
const semTag = () => semester.semester.replace("א", "a").replace("ב", "b").replace("ג", "c");

export function parseForumMail(m: { id: string; subject: string | null; body_text: string | null; received_at: string; is_read: boolean }): ForumPost | null {
  const body = (m.body_text ?? "").replace(/\s+/g, " ").trim();
  const head = body.match(/^(\d{5})-(\d{4}[abc])\s*->\s*פורומים\s*->\s*(.+?)\s*->\s*(.+?)\s+(https:\/\/opal\.openu\.ac\.il\/\S+)/);
  if (!head) return null;
  const [, courseCode, sem, forum, topicFromPath, url] = head;
  if (sem !== semTag()) return null;
  const subjectTopic = m.subject?.match(/בנושא\s+"(.+)"\s*$/)?.[1];
  const author = body.match(/נשלח ע["״]י:\s*(.+?)\s+בתאריך/)?.[1] ?? null;
  const text = body.split(/-{10,}/)[1]?.trim() ?? "";
  const topic = (subjectTopic ?? topicFromPath).trim();
  return {
    mailId: m.id,
    courseCode,
    forum: forum.trim(),
    topic,
    url,
    author,
    text: text.slice(0, 600),
    at: m.received_at,
    isRead: m.is_read,
    assignment: assignmentIn(`${topic} ${text.slice(0, 400)}`, courseCode),
  };
}

/** "ממ"ן 12", "ממ״ח 03", "מטלה 04" -> the assignment number. Courses numbering 11, 12… map to 01, 02… */
function assignmentIn(s: string, code: string): string | null {
  const m = s.match(/(?:ממ["״']?[ןח]|מטל(?:ה|ת)(?: קובץ| מקוונת)?)\s*(\d{2})/);
  if (!m) return null;
  let n = Number(m[1]);
  if (code === "20407" && n >= 11) n -= 10;
  return n >= 1 && n <= 20 ? String(n).padStart(2, "0") : null;
}

/** This semester's forum posts, newest first. */
export const getForumPosts = cache(async (): Promise<ForumPost[]> => {
  if (!supabaseEnabled) return [];
  const sb = await createClient();
  const { data } = await sb
    .from("mails")
    .select("id, subject, body_text, received_at, is_read")
    .ilike("sender", "%noreply-opal%")
    .like("subject", "%מפורום%")
    .order("received_at", { ascending: false })
    .limit(150);
  return (data ?? []).map(parseForumMail).filter((p): p is ForumPost => !!p);
});
