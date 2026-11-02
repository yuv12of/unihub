import { test } from "node:test";
import assert from "node:assert/strict";
import { detectedIn, findSolutionNote, hasIdNumber, normalizeHeadings, solutionNumbers } from "@/lib/submitCheck";

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


test("the model's reply becomes part keys; malformed entries are dropped", () => {
  const h = normalizeHeadings({
    pages: 8,
    parts: [
      { q: 1, part: "א", sub: null, page: 1, has_answer: true },
      { q: 1, part: "ב.", page: 1 },
      { q: 3, part: "ב", sub: "(1)", page: 6, has_answer: true },
      { q: 3, part: "ב", sub: 2, page: 6, has_answer: false },
      { q: 2, part: null, page: 3 },
      { q: 4, part: "x", page: 7 },
      { q: 0, part: "א" },
      "junk",
    ],
  });
  assert.deepEqual(h.keys.sort(), ["1א", "1ב", "2", "3ב(1)"].sort());
  assert.deepEqual(h.empty, ["3ב(2)"]);
  assert.equal(h.pages, 8);
  assert.deepEqual(normalizeHeadings(null), { keys: [], empty: [], pages: null });
});

test("a sheet part is answered by its heading, its parent part, or any heading of a part-less question", () => {
  const found = new Set(["1א", "3ב", "2א", "12"]);
  assert.equal(detectedIn(found, "1א"), true);
  assert.equal(detectedIn(found, "1ב"), false);
  assert.equal(detectedIn(found, "3ב(1)"), true);
  assert.equal(detectedIn(found, "3א"), false);
  assert.equal(detectedIn(found, "2"), true);
  assert.equal(detectedIn(found, "1"), true);
  assert.equal(detectedIn(new Set(["12"]), "1"), false);
  assert.equal(detectedIn(found, "4"), false);
});
