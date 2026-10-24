import { cache } from "react";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { semester } from "@/lib/semester";

/**
 * Course forum posts, read from the emails Opal sends, which already arrive in Unihub through the
 * mail script. Two kinds:
 * - single post ("הודעה מפורום הקורס ..."), body:
 *   "20474-2027a -> פורומים -> פורום חדשות -> <topic> <url> <title> נשלח ע"י: <author> בתאריך <d>, <t> ---- <text>"
 * - daily digest ("דף השער: מקבץ פורומים", since 20.10.2026 for every non-news forum): one block per
 *   discussion between "=====" lines, each block holding one or more posts. See parseDigestMail.
 */
export interface ForumPost {
  /**
   * The mail to open (/mail?open=…). Digest posts append "#p<post id>", so the value stays unique per
   * post (React keys) while the link still opens the digest mail: the fragment never reaches the server.
   */
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

export function parseForumMail(m: MailRow): ForumPost | null {
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

type MailRow = { id: string; subject: string | null; body_text: string | null; body_html?: string | null; received_at: string; is_read: boolean };

const DIGEST_SUBJECT = /מקבץ/;

/** Israel wall-clock time → ISO instant (handles summer/winter time without a date library). */
export function israelIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi) - 2 * 3_600_000; // winter offset first
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(guess));
  const lh = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  const lm = Number(parts.find((p) => p.type === "minute")!.value);
  let diff = h * 60 + mi - (lh * 60 + lm);
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return new Date(guess + diff * 60_000).toISOString();
}

/** Very small HTML → text, used only when a digest arrives without a text part. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d|table)>/gi, "\n")
    .replace(/<hr[^>]*>/gi, "\n" + "=".repeat(30) + "\n")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => `${label} (${href})`)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const POST_RE =
  /\((https:\/\/opal\.openu\.ac\.il\/[^)\s]+#p(\d+))\)\s*נשלח ע["״]י:\s*([\s\S]+?)\s+בתאריך\s+(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2})\s*-{10,}\s*([\s\S]*?)\s*-{10,}/g;

/**
 * An Opal daily digest ("מקבץ פורומים") → one ForumPost per post. Validated on real digests (21–23.10.2026).
 * Text layout (lines hard-wrapped at ~45 characters, CRLF):
 *   הודעות עבור פורומים המוגדרים למעקב במקבץ יומי
 *   ====…
 *   20109-2027a -> פורומים -> <forum> -> <discussion topic>   (may wrap over lines)
 *   <discussion url> ×2
 *   <post subject, "תגובה ל: …" for replies>
 *   (<discussion url>#p<post id>)
 *   נשלח ע"י: <author> בתאריך 21/10/2026, 13:16                (the time may wrap)
 *   ----…
 *   <post text>
 *   ----…<next post's discussion url>  … more posts of the same discussion
 *   ====…  next discussion
 */
export function parseDigestMail(m: MailRow): ForumPost[] {
  const raw = m.body_text?.trim() ? m.body_text : m.body_html ? htmlToText(m.body_html) : "";
  if (!raw) return [];
  const sem = semTag();
  const out: ForumPost[] = [];
  for (const block of raw.replace(/\r\n?/g, "\n").split(/\n\s*={20,}\s*\n/)) {
    const firstUrl = block.search(/https:\/\/opal\.openu\.ac\.il\//);
    if (firstUrl < 0) continue;
    const header = block.slice(0, firstUrl).replace(/\s+/g, " ").trim();
    const h = header.match(/^(\d{5})-(\d{4}[abc])\s*->\s*פורומים\s*->\s*(.+)\s*->\s*(.+)$/);
    if (!h) continue;
    const [, courseCode, blockSem, forum, topic] = h;
    if (blockSem !== sem) continue;
    for (const p of block.matchAll(POST_RE)) {
      const [, url, postId, author, d, mo, y, hh, mm, body] = p;
      const text = body.replace(/\s+/g, " ").trim();
      out.push({
        mailId: `${m.id}#p${postId}`,
        courseCode,
        forum: forum.trim(),
        topic: topic.trim(),
        url,
        author: author.replace(/\s+/g, " ").trim() || null,
        text: text.slice(0, 600),
        at: israelIso(Number(y), Number(mo), Number(d), Number(hh), Number(mm)),
        isRead: m.is_read,
        assignment: assignmentIn(`${topic} ${forum} ${text.slice(0, 400)}`, courseCode),
      });
    }
  }
  return out;
}

/** Any Opal forum mail (single post or digest) → its posts. */
export function parseOpalMail(m: MailRow): ForumPost[] {
  if (DIGEST_SUBJECT.test(m.subject ?? "")) return parseDigestMail(m);
  const one = parseForumMail(m);
  return one ? [one] : [];
}

/** "ממ"ן 12", "ממ״ח 03", "מטלה 04" -> the assignment number. Courses numbering 11, 12… map to 01, 02… */
function assignmentIn(s: string, code: string): string | null {
  const m = s.match(/(?:ממ["״']?[ןח]|מטל(?:ה|ת)(?: קובץ| מקוונת)?)\s*(\d{2})/);
  if (!m) return null;
  let n = Number(m[1]);
  if (code === "20407" && n >= 11) n -= 10;
  return n >= 1 && n <= 20 ? String(n).padStart(2, "0") : null;
}

/** Single-post mails and digests together → posts, newest first, each post once. */
export function forumPostsFrom(mails: MailRow[]): ForumPost[] {
  const seen = new Set<string>();
  const out: ForumPost[] = [];
  for (const p of mails.flatMap(parseOpalMail)) {
    const id = p.url?.match(/#p\d+$/) ? p.url : p.mailId;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(p);
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** This semester's forum posts, newest first. */
export const getForumPosts = cache(async (): Promise<ForumPost[]> => {
  if (!supabaseEnabled) return [];
  const sb = await createClient();
  const { data } = await sb
    .from("mails")
    .select("id, subject, body_text, body_html, received_at, is_read")
    .ilike("sender", "%noreply-opal%")
    .or("subject.like.%מפורום%,subject.like.%מקבץ%")
    .order("received_at", { ascending: false })
    .limit(150);
  return forumPostsFrom((data ?? []) as MailRow[]);
});
