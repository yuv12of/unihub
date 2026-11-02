import { test } from "node:test";
import assert from "node:assert/strict";
import { findSolutionNote, hasIdNumber, solutionNumbers } from "@/lib/submitCheck";

// Infi 2027א: file assignments 01, 03, 04, 06…; 02, 05 are online
const infi = [
  { n: "01", type: "file" as const },
  { n: "02", type: "online" as const },
  { n: "03", type: "file" as const },
  { n: "04", type: "file" as const },
  { n: "05", type: "online" as const },
];

test("a file assignment is also its ממ״ן number", () => {
  assert.deepEqual(solutionNumbers(infi, "01"), [1, 11]);
  assert.deepEqual(solutionNumbers(infi, "04"), [4, 13]);
  assert.deepEqual(solutionNumbers(infi, "02"), [2]);
});

const note = (id: string, name: string, folder: string, code: string, modified: string) => ({ id, name, folder, course_code: code, url: null, modified_at: modified });

test("the solution note: in the course, an assignment, the right number, the newest", () => {
  const notes = [
    note("la", "ממן 11.pdf", "Notability/Academy/לינארית 1/מטלות", "20109", "2026-10-28"),
    note("old", "ממן 11.pdf", "Notability/Academy/Infi 1/ממ״נים", "20474", "2026-03-01"),
    note("new", "ממן 11.pdf", "Notability/Academy/אינפי 1/מטלות", "20474", "2026-11-02"),
    note("13", "ממן 13.pdf", "Notability/Academy/Infi 1/ממ״נים", "20474", "2026-10-25"),
    note("book", "ממשיים 11.pdf", "Notability/Academy/אינפי 1/ספר", "20474", "2026-11-03"),
  ];
  assert.equal(findSolutionNote(notes, "20474", solutionNumbers(infi, "01"))?.id, "new");
  assert.equal(findSolutionNote(notes, "20474", solutionNumbers(infi, "04"))?.id, "13");
  assert.equal(findSolutionNote(notes, "20474", solutionNumbers(infi, "03")), null);
});

test("an ID number at the top", () => {
  assert.equal(hasIdNumber("pork for \n123456782 \n11 \n"), true);
  assert.equal(hasIdNumber("שאלה 1 (2n) ≤ 4"), false);
  assert.equal(hasIdNumber("x".repeat(700) + "123456782"), false);
});
