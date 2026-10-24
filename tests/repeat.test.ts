import { describe, expect, it } from "vitest";
import { cleanRepeat, describeRepeat, MAX_OCCURRENCES, repeatDates } from "@/lib/repeat";

const dates = (first: string, r: unknown) => {
  const c = cleanRepeat(r, first);
  return c ? repeatDates(first, c) : null;
};

describe("repeat", () => {
  it("weekly on Sun + Tue", () => {
    expect(dates("2026-10-25", { freq: "weekly", days: [0, 2], until: "2026-11-08" })).toEqual([
      "2026-10-25", "2026-10-27", "2026-11-01", "2026-11-03", "2026-11-08",
    ]);
  });
  it("weekly with no days = the first date's weekday", () => {
    const c = cleanRepeat({ freq: "weekly", until: "2026-11-15" }, "2026-10-28")!;
    expect(c.days).toEqual([3]);
    expect(repeatDates("2026-10-28", c)).toEqual(["2026-10-28", "2026-11-04", "2026-11-11"]);
  });
  it("every two weeks", () => {
    expect(dates("2026-10-25", { freq: "weekly", every: 2, days: [0, 4], until: "2026-11-22" })).toEqual([
      "2026-10-25", "2026-10-29", "2026-11-08", "2026-11-12", "2026-11-22",
    ]);
  });
  it("monthly on the same day of the month", () => {
    expect(dates("2026-10-15", { freq: "monthly", until: "2027-01-31" })).toEqual(["2026-10-15", "2026-11-15", "2026-12-15", "2027-01-15"]);
  });
  it("weekdays = Sunday to Thursday", () => {
    expect(dates("2026-10-25", { freq: "weekdays", until: "2026-11-01" })).toEqual([
      "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-11-01",
    ]);
  });
  it("rejects bad rules and drops bad weekdays", () => {
    expect(cleanRepeat({ freq: "yearly", until: "2027-01-01" }, "2026-10-25")).toBeNull();
    expect(cleanRepeat({ freq: "daily", until: "2026-10-25" }, "2026-10-25")).toBeNull();
    expect(cleanRepeat(null, "2026-10-25")).toBeNull();
    expect(cleanRepeat({ freq: "weekly", days: [10, 3, 1, 3], until: "2026-11-08" }, "2026-10-25")!.days).toEqual([1, 3]);
  });
  it("caps a series at MAX_OCCURRENCES rows and two years", () => {
    const c = cleanRepeat({ freq: "daily", until: "2030-01-01" }, "2026-10-25")!;
    expect(c.until).toBe("2028-10-24");
    expect(repeatDates("2026-10-25", c)).toHaveLength(MAX_OCCURRENCES);
  });
  it("describes the rule in Hebrew", () => {
    expect(describeRepeat({ freq: "weekly", every: 2, days: [0, 2], until: "2027-01-31" })).toBe("כל שבועיים בימים א׳, ג׳ עד 31.1");
    expect(describeRepeat({ freq: "weekdays", until: "2026-12-01" })).toBe("בימים א׳–ה׳ עד 1.12");
  });
});
