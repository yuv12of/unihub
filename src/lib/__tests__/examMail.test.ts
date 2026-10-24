import { test } from "node:test";
import assert from "node:assert/strict";
import { examsMoed, isoDate, parseExamDates } from "@/lib/examMail";
import { DEADLINE_REMINDER, FORUM_NOTICE, INVITATION, SHEILTA_TABLE } from "./examMail.fixture";

const mine = ["20109", "20474", "20407"];

test("Sheilta table: every date under its מועד, my current courses only", () => {
  const got = parseExamDates({ subject: "הודעה על מועדי בחינות בקורסים", body_text: "", attachments: [SHEILTA_TABLE] }, mine, "2027א");
  assert.deepEqual(
    got.map((e) => `${e.course_code} ${e.moed} ${e.date}`),
    ["20109 א 2027-02-02", "20109 א 2027-02-09", "20474 א 2027-02-09", "20474 א 2027-02-19", "20474 ב 2027-03-30", "20109 ב 2027-04-16"],
  );
  assert.ok(got.every((e) => e.start_time === null));
});

test("Sheilta table: another semester's course row is skipped", () => {
  const got = parseExamDates({ attachments: [SHEILTA_TABLE] }, ["20492", "20229"], "2027א");
  assert.deepEqual([...new Set(got.map((e) => e.course_code))], ["20229"]); // 20492 is listed as 2026ג
});

test("registration deadline reminder has no course → nothing", () => {
  assert.deepEqual(parseExamDates({ subject: "תזכורת לסטודנט על תאריך אחרון להרשמה לבחינה למועד", attachments: [DEADLINE_REMINDER] }, mine, "2027א"), []);
});

test("invitation: course, moed, dd.mm.yy date with a day name, time", () => {
  assert.deepEqual(parseExamDates({ subject: "זימון לבחינה", body_text: INVITATION }, mine, "2027א"), [
    { course_code: "20407", moed: "א", date: "2027-02-07", start_time: "09:00" },
  ]);
});

test("forum notice: three moadim, deadline of an assignment ignored", () => {
  const got = parseExamDates({ body_text: FORUM_NOTICE }, mine, "2027א");
  assert.deepEqual(got, [
    { course_code: "20407", moed: "א", date: "2027-02-14", start_time: "17:00" },
    { course_code: "20407", moed: "ב", date: "2027-03-21", start_time: "13:30" },
    { course_code: "20407", moed: "מיוחד", date: "2027-04-25", start_time: null },
  ]);
  assert.deepEqual(parseExamDates({ body_text: FORUM_NOTICE.replace("2027a", "2026c") }, mine, "2027א"), []);
});

test("helpers", () => {
  assert.equal(isoDate("7", "2", "27"), "2027-02-07");
  assert.equal(isoDate("31", "02", "2027"), null);
  assert.equal(examsMoed("מיוחד"), "ג");
});
