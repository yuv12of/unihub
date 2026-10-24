import { test } from "node:test";
import assert from "node:assert/strict";
import { forumPostsFrom, israelIso, parseDigestMail, parseOpalMail } from "@/lib/forum";
import { DIGEST_TEXT, SINGLE_TEXT } from "./opalDigest.fixture";

const digest = { id: "m1", subject: "דף השער: מקבץ פורומים", body_text: DIGEST_TEXT, received_at: "2026-10-23T14:00:00Z", is_read: false };

test("digest: one post per post, this semester only", () => {
  const posts = parseDigestMail(digest);
  assert.equal(posts.length, 4);
  assert.deepEqual(posts.map((p) => p.mailId), ["m1#p9001", "m1#p9002", "m1#p9003", "m1#p9004"]);
});

test("digest: header topic and forum survive line wraps", () => {
  const [a, b, c, d] = parseDigestMail(digest);
  assert.equal(a.courseCode, "20109");
  assert.equal(a.forum, "פורום כללי");
  assert.equal(a.topic, "מטלות להגשה");
  assert.equal(b.topic, "מטלות להגשה"); // a reply keeps the discussion topic, not "תגובה ל: …"
  assert.equal(c.forum, "פורום לפרקים 1 - 2: מערכות משוואות לינאריות והמרחב Fⁿ");
  assert.equal(c.topic, "משפטים בהוכחות בסרטון של השיעור הראשון");
  assert.equal(d.courseCode, "20407");
  assert.equal(d.forum, 'פורום לממ"ן 11');
});

test("digest: author, text, url, time", () => {
  const [a, b, , d] = parseDigestMail(digest);
  assert.equal(a.author, "סטודנט א");
  assert.equal(b.author, "מנחה ב");
  assert.equal(a.text, "היי מופיע במפ”ה שצריך להגיש 3 מטלות 03,08,05 ב25/10");
  assert.equal(a.url, "https://opal.openu.ac.il/mod/ouilforum/discuss.php?d=100#p9001");
  assert.equal(a.at, "2026-10-21T14:48:00.000Z"); // 17:48 Israel summer time (UTC+3)
  assert.equal(d.author, "סטודנט ד ה"); // the date wrapped onto the next line
  assert.equal(d.at, "2026-10-22T12:28:00.000Z");
  assert.ok(d.text.includes("SA(n)=8n^2+128nlgn"));
  assert.equal(d.assignment, "01"); // "ממ"ן 11" in 20407 is assignment 01
});

test("digest: read through the general entry point and deduped across mails", () => {
  assert.equal(parseOpalMail(digest).length, 4);
  const again = { ...digest, id: "m2" };
  assert.equal(forumPostsFrom([digest, again]).length, 4);
});

test("digest: html-only mail falls back to a text rendering", () => {
  const html = DIGEST_TEXT.replace(/\r\n/g, "<br>\n");
  assert.equal(parseDigestMail({ ...digest, body_text: null, body_html: html }).length, 4);
});

test("single-post mails still parse", () => {
  const m = { id: "s1", subject: 'הודעה מפורום הקורס "חשבון אינפיניטסימלי 1" בנושא "חוברת ההגדרות והמשפטים לבחינה"', body_text: SINGLE_TEXT, received_at: "2026-10-19T14:31:26Z", is_read: true };
  const [p] = parseOpalMail(m);
  assert.equal(p.mailId, "s1");
  assert.equal(p.forum, "פורום חדשות");
  assert.equal(p.topic, "חוברת ההגדרות והמשפטים לבחינה");
  assert.equal(p.author, "מרכזת הקורס");
  assert.equal(p.assignment, "11");
});

test("israelIso handles winter time", () => {
  assert.equal(israelIso(2026, 12, 1, 9, 0), "2026-12-01T07:00:00.000Z");
});
