import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTask } from "@/lib/quickAdd";

const goals = [
  { id: "1", title: "אתר תיק עבודות" },
  { id: "2", title: "ריצת 10 ק״מ" },
];
const today = "2026-11-13"; // Friday

test("only lines that start with משימה are tasks", () => {
  assert.equal(parseTask("אימון מחר 18:00", today, goals), null);
  assert.equal(parseTask("משימה", today, goals), null);
  assert.equal(parseTask("משימות לשבוע", today, goals), null);
});

test("a plain task has no date", () => {
  const t = parseTask("משימה לחדש דרכון", today, goals)!;
  assert.equal(t.title, "לחדש דרכון");
  assert.equal(t.due, null);
  assert.equal(t.goal, null);
});

test("a day or date becomes the due date", () => {
  assert.equal(parseTask("משימה: לחדש דרכון מחר", today, goals)!.due, "2026-11-14");
  assert.equal(parseTask("משימה לחדש דרכון מחר", today, goals)!.title, "לחדש דרכון");
  assert.equal(parseTask("משימה לקבוע תור 20/11", today, goals)!.due, "2026-11-20");
  assert.equal(parseTask("משימה להתקשר לבנק היום", today, goals)!.due, today);
  assert.equal(parseTask("משימה צילומי מסך ביום שלישי", today, goals)!.due, "2026-11-17");
});

test("למטרה ties the task to a goal by the start of its name", () => {
  const t = parseTask("משימה צילומי מסך מחר למטרה אתר", today, goals)!;
  assert.equal(t.goal?.id, "1");
  assert.equal(t.title, "צילומי מסך");
  assert.equal(t.due, "2026-11-14");
  assert.equal(parseTask("משימה לקנות נעליים למטרה ריצת", today, goals)!.goal?.id, "2");
  const u = parseTask("משימה משהו למטרה טיול", today, goals)!;
  assert.equal(u.goal, null);
  assert.equal(u.unknownGoal, "טיול");
});
