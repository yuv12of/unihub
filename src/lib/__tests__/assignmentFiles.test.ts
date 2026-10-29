import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOKLET, answerFor, extrasFor, guessAssignment, linkFor, sheetFor } from "@/lib/assignmentFiles";

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

test("links and submitted files are kept apart from sheets", () => {
  const files = [
    { n: "01", kind: "sheet" as const, url: "https://opal.openu.ac.il/mod/quiz/view.php?id=1", id: "l" },
    { n: "12", kind: "answer" as const, url: null, id: "a1" },
    { n: "12", kind: "answer" as const, url: null, id: "a2" },
    { n: "12", kind: "sheet" as const, url: null, id: "s" },
  ];
  assert.equal(sheetFor(files, "01"), null);
  assert.equal(linkFor(files, "01")?.id, "l");
  assert.equal(sheetFor(files, "12")?.id, "s");
  assert.equal(answerFor(files, "12")?.id, "a2");
  assert.equal(linkFor(files, "12"), null);
});

test("a zip next to the sheet is an extra, never the sheet", () => {
  const files = [
    { n: "02", kind: "sheet" as const, url: null, pdf: false, id: "zip" },
    { n: "02", kind: "sheet" as const, url: null, pdf: true, id: "pdf" },
  ];
  assert.equal(sheetFor(files, "02")?.id, "pdf");
  assert.deepEqual(extrasFor(files, "02").map((f) => f.id), ["zip"]);
});
