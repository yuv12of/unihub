import { test } from "node:test";
import assert from "node:assert/strict";
import { currentMeetup, examLines, meetupPhase, questionLines, stamp } from "@/lib/meetup";
import { remindersFor } from "@/lib/reminders";

const ev = (over: Partial<Parameters<typeof meetupPhase>[0]> = {}) => ({
  date: "2026-11-08",
  start_time: "18:00",
  end_time: "21:00",
  kind: "tutorial",
  course_code: "20109",
  cancelled: false,
  ...over,
});
const m = (h: number, mm = 0) => h * 60 + mm;

test("phases: 30 min before → soon, during → live, an hour after → after, then off", () => {
  assert.equal(meetupPhase(ev(), "2026-11-08", m(17, 29)), null);
  assert.equal(meetupPhase(ev(), "2026-11-08", m(17, 30)), "soon");
  assert.equal(meetupPhase(ev(), "2026-11-08", m(18, 0)), "live");
  assert.equal(meetupPhase(ev(), "2026-11-08", m(21, 0)), "after");
  assert.equal(meetupPhase(ev(), "2026-11-08", m(22, 0)), null);
  assert.equal(meetupPhase(ev(), "2026-11-09", m(18, 0)), null);
  assert.equal(meetupPhase(ev({ cancelled: true }), "2026-11-08", m(18, 0)), null);
  assert.equal(meetupPhase(ev({ kind: "custom" }), "2026-11-08", m(18, 0)), null);
});

test("a live meetup wins over one that ended", () => {
  const a = ev({ start_time: "16:00", end_time: "17:45", course_code: "20407" });
  const b = ev();
  assert.equal(currentMeetup([a, b], "2026-11-08", m(18, 10))!.event.course_code, "20109");
});

test("note markers and time stamps", () => {
  const body = "הגדרה של בסיס\n❓ למה מימד מוגדר היטב\n  ⭐ משפט המימד יבוא בבחינה\n❓\nסתם שורה";
  assert.deepEqual(questionLines(body), ["למה מימד מוגדר היטב"]);
  assert.deepEqual(examLines(body), ["משפט המימד יבוא בבחינה"]);
  assert.equal(stamp("18:00", m(18, 42)), "[0:42]");
  assert.equal(stamp("18:00", m(19, 5)), "[1:05]");
});

test("reminders: meetup push ~30 min ahead into meetup mode; quiet while it's live", () => {
  const feed = {
    events: [{ id: "e1", date: "2026-11-08", start_time: "18:00", end_time: "21:00", title: "מפגש הנחיה מקוון", kind: "tutorial", course_code: "20109", location: null, cancelled: false, source: "sheilta" }],
    session_status: {},
  };
  const data = {
    feed,
    sessions: [{ date: "2026-11-08", start: "18:20", end: "19:50", title: "לימוד", minutes: 90, courseCode: "20474", kind: "routine" }],
    progress: {},
    courses: [{ code: "20109", short: "אלגברה", name: "אלגברה לינארית 1", color: "#00f", assignments: [] }],
    routines: [],
    logs: [],
    plan: { sessions: [], warnings: [] },
    offDays: [],
  } as unknown as Parameters<typeof remindersFor>[0];
  const before = remindersFor(data, { date: "2026-11-08", minutes: m(17, 31) });
  const push = before.find((p) => p.key === "e|e1")!;
  assert.equal(push.url, "/meetup/20109/2026-11-08");
  assert.match(push.title, /מפגש באלגברה/);
  const during = remindersFor(data, { date: "2026-11-08", minutes: m(18, 5) });
  assert.equal(during.some((p) => p.key.startsWith("s|")), false);
});
