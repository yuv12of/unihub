import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMoves, sessionKey, type Session } from "@/lib/planner";

const s = (date: string, start: string, end: string, code: string, ref = "routine"): Session => ({
  date,
  start,
  end,
  minutes: (Number(end.slice(0, 2)) * 60 + Number(end.slice(3))) - (Number(start.slice(0, 2)) * 60 + Number(start.slice(3))),
  courseCode: code,
  kind: "routine",
  title: `לימוד ב${code}`,
  ref,
});

test("a moved session takes its new day, time and length; key stays", () => {
  const a = s("2026-11-01", "09:00", "10:30", "20109");
  const key = sessionKey(a);
  const out = applyMoves([a], { [key]: { date: "2026-11-02", start: "14:00", minutes: 60 } });
  assert.deepEqual([out[0].date, out[0].start, out[0].end, out[0].minutes, out[0].moved], ["2026-11-02", "14:00", "15:00", 60, true]);
  assert.equal(sessionKey(out[0]), key);
});

test("a session it now overlaps shifts after it (and after busy blocks)", () => {
  const a = s("2026-11-01", "09:00", "10:30", "20109");
  const b = s("2026-11-02", "14:00", "15:30", "20474");
  const out = applyMoves([a, b], { [sessionKey(a)]: { date: "2026-11-02", start: "14:00", minutes: 90 } }, [{ date: "2026-11-02", start: "15:45", end: "17:00" }]);
  const moved = out.find((x) => x.courseCode === "20109")!;
  const other = out.find((x) => x.courseCode === "20474")!;
  assert.equal(moved.start, "14:00");
  // 15:30 + break would hit the 15:45–17:00 block, so it goes after it
  assert.equal(other.start, "17:15");
  assert.equal(other.end, "18:45");
});

test("no moves → untouched; unknown keys ignored", () => {
  const a = s("2026-11-01", "09:00", "10:30", "20109");
  assert.deepEqual(applyMoves([a], null), [a]);
  assert.equal(applyMoves([a], { "x|y": { date: "2026-11-05", start: "10:00", minutes: 60 } })[0].date, "2026-11-01");
});
