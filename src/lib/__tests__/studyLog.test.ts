import { test } from "node:test";
import assert from "node:assert/strict";
import { logKey, toEntry, totals } from "@/lib/studyLog";

test("rows become entries; only done rows with a known kind", () => {
  assert.equal(toEntry({ session_key: "2026-10-25|routine|20109|routine", status: "skipped", minutes: null }), null);
  assert.equal(toEntry({ session_key: "garbage", status: "done", minutes: 30 }), null);
  const r = toEntry({ session_key: "2026-10-25|routine|20109|routine2", status: "done", minutes: 90 })!;
  assert.deepEqual([r.date, r.kind, r.code, r.label, r.movable, r.minutes], ["2026-10-25", "routine", "20109", "לימוד שוטף", false, 90]);
  assert.equal(toEntry({ session_key: "2026-10-25|assignment|20474|a01-2", status: "done", minutes: 60 })!.label, "הכנה למטלה 01");
  assert.equal(toEntry({ session_key: "2026-12-01|exam|20407|mock", status: "done", minutes: 180 })!.label, "בחינה לדוגמה");
  assert.equal(toEntry({ session_key: "2026-12-01|routine|20407|exam1", status: "done", minutes: 90 })!.label, "חזרה לבחינה");
  const log = toEntry({ session_key: "2026-10-25|log|other|1792924231154", status: "done", minutes: 25 })!;
  assert.deepEqual([log.code, log.movable, log.label], [null, true, "רישום ידני"]);
});

test("keys and totals", () => {
  assert.equal(logKey("2026-10-26", null, 5), "2026-10-26|log|other|5");
  assert.equal(logKey("2026-10-26", "20109", 5), "2026-10-26|log|20109|5");
  const es = [
    toEntry({ session_key: "2026-10-25|log|20109|1", status: "done", minutes: 30 })!,
    toEntry({ session_key: "2026-10-25|routine|20474|routine", status: "done", minutes: 90 })!,
    toEntry({ session_key: "2026-10-26|log|other|2", status: "done", minutes: 15 })!,
  ];
  const t = totals(es);
  assert.equal(t.all, 135);
  assert.deepEqual(t.byDay, { "2026-10-25": 120, "2026-10-26": 15 });
  assert.deepEqual(t.byCourse, { "20109": 30, "20474": 90, other: 15 });
});
