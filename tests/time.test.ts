import { describe, expect, it } from "vitest";
import { clock, duration, durationShort, ltr, range } from "@/lib/time";

const LRI = "⁦";
const PDI = "⁩";

describe("time formatting", () => {
  it("duration never looks like a clock time", () => {
    expect(duration(0)).toBe("0 דק׳");
    expect(duration(45)).toBe("45 דק׳");
    expect(duration(60)).toBe("שעה");
    expect(duration(90)).toBe("שעה ו־30 דק׳");
    expect(duration(120)).toBe("שעתיים");
    expect(duration(150)).toBe("2 ש׳ ו־30 דק׳");
    expect(duration(300)).toBe("5 שעות");
    expect(duration(-5)).toBe("0 דק׳");
    expect(duration(89.6)).toBe("שעה ו־30 דק׳");
  });
  it("durationShort", () => {
    expect(durationShort(45)).toBe("45 ד׳");
    expect(durationShort(60)).toBe("1 ש׳");
    expect(durationShort(90)).toBe("1.5 ש׳");
    expect(durationShort(75)).toBe("1 ש׳ 15 ד׳");
  });
  it("ranges are isolated left-to-right and 24:00 reads 00:00", () => {
    expect(range("08:45", "10:15")).toBe(`${LRI}08:45–10:15${PDI}`);
    expect(range("23:15", "24:00")).toBe(`${LRI}23:15–00:00${PDI}`);
    expect(range("09:00")).toBe(`${LRI}09:00${PDI}`);
    expect(range("09:00", "09:00")).toBe(`${LRI}09:00${PDI}`);
    expect(range(null)).toBe("");
    expect(clock("24:00")).toBe("00:00");
    expect(ltr("23.10–30.10")).toBe(`${LRI}23.10–30.10${PDI}`);
  });
});
