import { test } from "node:test";
import assert from "node:assert/strict";
import { PART_KEY, parseSheet, partItems } from "@/lib/sheetStructure";

const shape = (text: string) =>
  parseSheet(text).questions.map((q) => `${q.q}:${q.points ?? "-"}:${q.parts.map((p) => p.label + (p.subs.length ? `(${p.subs.join(",")})` : "")).join("")}`);

// Lines as pdf.js extracts them from the real 2027א sheets
test("Infi 20474 sheet 01: reversed parentheses, dropped נ, sub-parts (1)(2)", () => {
  const text = [
    "מטלה01",
    "קורס:חשבון איפייטסימלי1)20474(",
    "שאלה1)25קודות(",
    "א.הוכיחו כי לכלnטבעי מתקיים",
    "2 4nn",
    "ב.הוכיחו באידוקציה או בכל דרך אחרת כי לכלnטבעי מתקיים",
    "שאלה2)20קודות(",
    "א.הוכיחו שאם2",
    "ב.הוכיחו:",
    "שאלה3)25קודות(",
    "א.פתרו את האי-שוויון2",
    "ב.פתרו את המשוואות:",
    ")1(",
    "2 1 25x",
    ")2(2 3x   ",
    "הקפידו למק את כל טעותיכם.",
    "\f",
    "שאלה4)30קודות(",
    "א.תהיAקבוצה של מספרים ממשיים הצפופה בקטע(1, ).",
    "ב.סחו:Aאיה צפופה בקטעI.",
    "אפשרלהיעזר בסעיף2.1.4ושאלה12ביחידה2.",
    "ג.תהיAקבוצה של מספרים ממשיים המוכלת בקטע(1, )וצפופהבו.",
  ].join("\n");
  assert.deepEqual(shape(text), ["1:25:אב", "2:20:אב", "3:25:אב(1,2)", "4:30:אבג"]);
  const q3 = parseSheet(text).questions[2];
  assert.deepEqual(partItems(q3).map((p) => p.key), ["3א", "3ב(1)", "3ב(2)"]);
});

test("Linear Algebra 20109: שאלה1(15נקודות), a question without parts", () => {
  const text = ["מספר השאלות:6משקל המטלה:3נקודות", "שאלה1(15נקודות)", "א.האם קבוצת", "ב.האם הקבוצה", "שאלה2(10נקודות)", "טקסט", "שאלה3(30נקודות)", "א.נתונה", "ב.נתונה"].join("\n");
  assert.deepEqual(shape(text), ["1:15:אב", "2:10:", "3:30:אב"]);
  assert.deepEqual(partItems(parseSheet(text).questions[1]), [{ key: "2", label: "שאלה 2" }]);
});

test("Data Structures 20407: points per part, 'ב( .9נקודות)' and '1( .2נקודות)'", () => {
  const text = [
    "יחידות1–4| ארבע שאלות |25נקודותכל אחת",
    "שאלה1",
    "א. (3נקודות)בחרו תשובה אחת.",
    "ב( .4נקודות)בחרו את כל הטענות",
    "שאלה2",
    "א. (5נקודות)בחרו",
    "ג. (7נקודות)לא בסדר",
    "ב. (5נקודות)חיפוש",
    "1( .2נקודות) היכן יוכנס",
    "2( .5נקודות) לאחר הכנסת",
  ].join("\n");
  assert.deepEqual(shape(text), ["1:-:אב", "2:-:אב(1,2)"]);
});

test("the font's private-use נ (U+F8FF) still reads as points", () => {
  assert.deepEqual(shape("שאלה1)25\uf8ffקודות(\nא.טקסט"), ["1:25:א"]);
});

test("one question of 100 points", () => {
  const text = ["חומר הלימוד יחידות1–4| שאלה אחת |100נקודות", "\f", "שאלה100נקודות", "א. (15נקודות)הכנת", "ב. (25נקודות)ביצוע"].join("\n");
  assert.deepEqual(shape(text), ["1:100:אב"]);
});

test("references to other questions are not headings", () => {
  const text = ["שאלה1)30קודות(", "בשאלה זו יש להוכיח", "הערה: התבוו בשאלה16מיחידה2.", "שאלה 16 ביחידה 2", "שאלה2)25קודות("].join("\n");
  assert.deepEqual(shape(text), ["1:30:", "2:25:"]);
});

test("stored part keys", () => {
  assert.match("part:3ב(1)", PART_KEY);
  assert.match("part:2", PART_KEY);
  assert.doesNotMatch("part:x", PART_KEY);
  assert.doesNotMatch("submit", PART_KEY);
});
