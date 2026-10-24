import { describe, expect, it } from "vitest";
import { weekBalance } from "@/lib/weekBalance";

const week = ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"];

describe("weekBalance", () => {
  it("free time from now to bed, minus taken blocks; planned study counted", () => {
    const wb = weekBalance({
      days: week,
      blocksOn: (d) =>
        d === "2026-10-25"
          ? [
              { start: "23:15", end: "24:00", kind: "routine" },
              { start: "11:00", end: "12:30", kind: "study", minutes: 90 },
              { start: "08:00", end: "09:00", kind: "study", minutes: 60 }, // already past
            ]
          : [],
      today: "2026-10-25",
      nowMin: 600,
      wake: 480,
      bed: 1440,
      studied: { "2026-10-25": 60 },
      goal: 1200,
    });
    expect(wb.freeByDay["2026-10-25"]).toBe(1440 - 600 - 45 - 90);
    expect(wb.freeByDay["2026-10-26"]).toBe(1440 - 480);
    expect(wb.planned).toBe(90);
    expect(wb.done).toBe(60);
    expect(wb.gap).toBe(1200 - 60 - 90);
    expect(wb.past).toBe(false);
  });
  it("overlapping blocks are counted once, skipped ones not at all", () => {
    const wb = weekBalance({
      days: week,
      blocksOn: () => [
        { start: "10:00", end: "12:00", kind: "routine" },
        { start: "11:00", end: "13:00", kind: "event" },
        { start: "14:00", end: "15:00", kind: "study", status: "skipped" },
      ],
      today: "2026-10-31",
      nowMin: 0,
      wake: 480,
      bed: 1380,
      studied: {},
      goal: null,
    });
    expect(wb.freeByDay["2026-10-31"]).toBe(1380 - 480 - 180);
    expect(wb.free).toBe(wb.freeByDay["2026-10-31"]);
    expect(wb.gap).toBe(0);
  });
  it("a past week is marked past", () => {
    const wb = weekBalance({ days: week, blocksOn: () => [], today: "2026-11-02", nowMin: 0, wake: 480, bed: 1440, studied: {}, goal: 600 });
    expect(wb.past).toBe(true);
    expect(wb.free).toBe(0);
  });
});
