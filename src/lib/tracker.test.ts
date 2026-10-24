/** Run like strategy.test.ts (jiti with the "@" alias). */
import { test } from "node:test";
import assert from "node:assert/strict";
import data from "@/data/semester-2027a.json";
import { courseFromRow, type CourseRow } from "@/lib/semester";
import { submissionConfirmation } from "@/lib/tracker";

type Raw = { code: string; name: string; assignmentWeight: { min: number; max: number }; assignments: CourseRow["assignments"] };
const courses = (data as unknown as { courses: Raw[] }).courses.map((c) =>
  courseFromRow({ code: c.code, name: c.name, min_weight: c.assignmentWeight.min, max_weight: c.assignmentWeight.max, assignments: c.assignments }),
);
const OU = "The Open University <do-not-reply@openu.ac.il>";

test("matches a confirmation with course code and ממ\"ן number (11 = first file assignment)", () => {
  assert.deepEqual(submissionConfirmation({ sender: OU, subject: "אישור הגשת מטלה", body: "מטלה 11 בקורס 20474 התקבלה במערכת" }, courses), { course_code: "20474", n: "01" });
  assert.deepEqual(submissionConfirmation({ sender: OU, subject: "המטלה הוגשה בהצלחה - 20109 ממ\"ן 12", body: "" }, courses), { course_code: "20109", n: "02" });
});

test("ignores grading notices, reminders, other senders and mail without a course or number", () => {
  assert.equal(submissionConfirmation({ sender: OU, subject: "הודעה על סיום בדיקת מטלה", body: "20474 מטלה 11" }, courses), null);
  assert.equal(submissionConfirmation({ sender: OU, subject: "תזכורת: הגשת מטלה", body: "20474 מטלה 11" }, courses), null);
  assert.equal(submissionConfirmation({ sender: "x@gmail.com", subject: "אישור הגשת מטלה", body: "20474 מטלה 11" }, courses), null);
  assert.equal(submissionConfirmation({ sender: OU, subject: "אישור הגשת מטלה", body: "מטלה 11 התקבלה" }, courses), null);
  assert.equal(submissionConfirmation({ sender: OU, subject: "אישור הגשת מטלה", body: "קורס 20474" }, courses), null);
});
