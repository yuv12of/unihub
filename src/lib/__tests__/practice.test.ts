import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePracticeName } from "@/lib/practiceMarks";

test("practice note names", () => {
  assert.deepEqual(parsePracticeName("תרגול 20109 3.2.pdf"), { course: "20109", exercise: "3.2" });
  assert.deepEqual(parsePracticeName("תרגול 20474"), { course: "20474", exercise: null });
  assert.deepEqual(parsePracticeName("מבחן 20407 2025א מועד 81 שאלה 2"), { course: "20407", exercise: "2025א מועד 81 שאלה 2" });
  assert.equal(parsePracticeName("Note 5 May 2025.pdf"), null);
  assert.equal(parsePracticeName("ממן 11 20109"), null); // live assignments are never marked
});
