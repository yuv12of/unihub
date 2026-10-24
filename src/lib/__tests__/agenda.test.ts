import { test } from "node:test";
import assert from "node:assert/strict";
import { assignmentOf, sessionAgenda, type AgendaData } from "@/lib/agenda";

const routine = { minutes: 90, courseCode: "20109", kind: "routine" as const, ref: "routine", title: "לימוד שוטף באלגברה" };
const reading = { bookId: "b1", idx: 3, title: "פרק 2.3: מטריצות", lastPage: 47, href: "/books/b1?ch=3" };

test("routine session: continue reading, video, questions, cards (max 4)", () => {
  const d: AgendaData = {
    reading,
    videos: [
      { id: "v0", title: "שיעור 2", minutes: 20, watched: true },
      { id: "v1", title: "שיעור 3", minutes: 22, watched: false },
    ],
    cardsDue: 8,
    chapterQuestions: { chapterId: "c3", open: 5, href: "/books/b1?ch=3" },
  };
  const s = sessionAgenda(routine, d);
  assert.deepEqual(s.map((x) => x.kind), ["read", "video", "questions", "cards"]);
  assert.match(s[0].text, /^להמשיך מעמ׳ 47 \(פרק 2\.3: מטריצות\)/);
  assert.equal(s[1].text, "סרטון: שיעור 3 (22 דק׳)");
  assert.equal(s[2].text, "לענות על 2 שאלות מהפרק");
  assert.equal(s[3].text, "8 כרטיסיות שמחכות");
  assert.equal(s[0].id, "read:b1:3");
  // reading gets what the other steps leave: 90 - 22 - 20 - 6
  assert.equal(s[0].minutes, 42);
});

test("short session skips the video; no reading place falls back to this week's reading", () => {
  const s = sessionAgenda({ ...routine, minutes: 45 }, {
    week: { kind: "week", ref: "2", starts: null, label: "", estimated: false, links: [{ title: "פרק 1", href: "/books/b1?ch=1", done: true }, { title: "פרק 2", note: "סעיפים 2.1–2.2", href: "/books/b1?ch=2", done: false }] },
    videos: [{ id: "v1", title: "שיעור 3", minutes: 10, watched: false }],
    cardsDue: 40,
  });
  assert.deepEqual(s.map((x) => x.kind), ["read", "cards"]);
  assert.equal(s[0].text, "לקרוא: פרק 2, סעיפים 2.1–2.2");
  assert.equal(s[1].text, "15 כרטיסיות שמחכות"); // capped
});

test("assignment session names the next open question", () => {
  const s = sessionAgenda({ minutes: 120, courseCode: "20109", kind: "assignment", ref: "a01-2", title: "הכנה לממ״ן 01" }, {
    assignmentLabel: "ממ״ן",
    courseHref: "/courses/20109",
    assignmentQuestions: [
      { n: "01", q: 1, status: "done" },
      { n: "01", q: 2, status: "stuck" },
      { n: "01", q: 3, status: "draft", material: "2.1–2.3" },
      { n: "02", q: 1, status: "todo" },
    ],
    cardsDue: 3,
  });
  assert.equal(s[0].id, "q:01:3");
  assert.match(s[0].text, /^ממ״ן 01 שאלה 3 \(להשלים טיוטה\) · חומר: /);
  assert.equal(s[1].id, "q:01:2"); // stuck goes last but still shows in a long session
  assert.equal(s[2].kind, "cards");
});

test("assignment session without a question tracker: unread material, then the assignment", () => {
  const s = sessionAgenda({ minutes: 60, courseCode: "20474", kind: "assignment", ref: "a12", title: "" }, {
    assignmentLabel: "ממ״ן",
    assignmentReading: { kind: "assignment", ref: "12", starts: null, label: "", estimated: false, links: [{ title: "יחידה 1", href: "/books/x?ch=1", done: false }] },
  });
  assert.deepEqual(s.map((x) => x.text), ["לקרוא לפני: יחידה 1"]);
  const bare = sessionAgenda({ minutes: 60, courseCode: "20474", kind: "assignment", ref: "a12", title: "" }, { assignmentLabel: "ממ״ן" });
  assert.deepEqual(bare.map((x) => x.text), ["לעבוד על ממ״ן 12"]);
});

test("exam session: cards, questions, a past exam question", () => {
  const s = sessionAgenda({ minutes: 120, courseCode: "20109", kind: "exam", ref: "exam", title: "" }, { cardsDue: 1, chapterQuestions: { chapterId: "c", open: 1, href: "/b" } });
  assert.deepEqual(s.map((x) => x.text), ["כרטיסייה אחת שמחכה", "לענות על שאלה מהפרק", "שאלה אחת מבחינה קודמת, בזמן"]);
});

test("nothing known → no steps", () => {
  assert.deepEqual(sessionAgenda(routine, {}), []);
});

test("assignmentOf", () => {
  assert.equal(assignmentOf("a01-2"), "01");
  assert.equal(assignmentOf("a12"), "12");
  assert.equal(assignmentOf("routine"), null);
});
