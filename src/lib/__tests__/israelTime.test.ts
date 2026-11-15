import { test } from "node:test";
import assert from "node:assert/strict";
import { fromIsraelLocal, israelLocal } from "@/lib/time";

test("Israel wall-clock time, winter and summer", () => {
  assert.equal(israelLocal(Date.parse("2026-11-14T06:00:00Z")), "2026-11-14T08:00"); // UTC+2
  assert.equal(israelLocal(Date.parse("2026-07-01T05:30:00Z")), "2026-07-01T08:30"); // UTC+3
  assert.equal(israelLocal(Date.parse("2026-11-14T22:30:00Z")), "2026-11-15T00:30"); // past midnight
  assert.equal(fromIsraelLocal("2026-11-14T08:00"), Date.parse("2026-11-14T06:00:00Z"));
  assert.equal(fromIsraelLocal("2026-11-14T20:00"), Date.parse("2026-11-14T18:00:00Z"));
  assert.equal(fromIsraelLocal("2026-07-01T08:30"), Date.parse("2026-07-01T05:30:00Z"));
});

test("round trip, minute by minute across both clock changes of 2026", () => {
  for (const start of ["2026-03-26T12:00:00Z", "2026-10-24T12:00:00Z"]) {
    const t0 = Date.parse(start);
    for (let m = 0; m < 48 * 60; m += 7) {
      const t = t0 + m * 60_000;
      const back = fromIsraelLocal(israelLocal(t))!;
      // the repeated hour when clocks go back has two answers; either is the same wall-clock time
      assert.equal(israelLocal(back), israelLocal(t));
    }
  }
});

test("rejects anything that is not a wall-clock time", () => {
  for (const bad of ["", "2026-11-14", "2026-11-14T8:00", "2026-13-40T99:99", "now"]) assert.equal(fromIsraelLocal(bad), null, bad);
});
