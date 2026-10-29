import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOKLET, guessAssignment, sheetFor } from "@/lib/assignmentFiles";

const ns = ["11", "12", "13", "14", "01", "02"];

test("named assignments in Hebrew and Latin spellings", () => {
  assert.equal(guessAssignment("ממ״ן 12 - לינארית.pdf", ns), "12");
  assert.equal(guessAssignment("mmn11.pdf", ns), "11");
  assert.equal(guessAssignment("20474_maman_13_2027a.pdf", ns), "13");
  assert.equal(guessAssignment("ממח 2.pdf", ns), "02");
  assert.equal(guessAssignment("ממ\"ן14.PDF", ns), "14");
});

test("a named number that isn't one of the course's assignments stays unmatched", () => {
  assert.equal(guessAssignment("ממן 17.pdf", ns), null);
});

test("the booklet", () => {
  assert.equal(guessAssignment("חוברת מטלות 2027א.pdf", ns), BOOKLET);
  assert.equal(guessAssignment("20109_matalot.pdf", ns), BOOKLET);
});

test("a bare number counts only when it is one assignment, never the course code or a year", () => {
  assert.equal(guessAssignment("20109 - 12.pdf", ns), "12");
  assert.equal(guessAssignment("20109_2027.pdf", ns), null);
  assert.equal(guessAssignment("scan 11 12.pdf", ns), null);
});

test("sheetFor prefers the assignment's own file, then the booklet", () => {
  const files = [{ n: BOOKLET, id: "b" }, { n: "12", id: "x" }];
  assert.equal(sheetFor(files, "12")?.id, "x");
  assert.equal(sheetFor(files, "13")?.id, "b");
  assert.equal(sheetFor([{ n: "11", id: "y" }], "13"), null);
});
