import { test } from "node:test";
import assert from "node:assert/strict";
import { daysOf, vacationsOf } from "@/lib/vacation";

test("a vacation's days, both ends included", () => {
  assert.deepEqual(daysOf("2026-12-13", "2026-12-16"), ["2026-12-13", "2026-12-14", "2026-12-15", "2026-12-16"]);
  assert.deepEqual(daysOf("2026-12-31", "2027-01-01"), ["2026-12-31", "2027-01-01"]);
  assert.deepEqual(daysOf("2026-12-16", "2026-12-13"), []);
});

test("consecutive days become one vacation", () => {
  assert.deepEqual(vacationsOf(["2026-12-15", "2026-12-13", "2026-12-14", "2026-12-20"]), [
    { from: "2026-12-13", to: "2026-12-15" },
    { from: "2026-12-20", to: "2026-12-20" },
  ]);
});
