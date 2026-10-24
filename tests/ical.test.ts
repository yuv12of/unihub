import { describe, expect, it } from "vitest";
import { renderCalendar } from "@/lib/ical";

describe("iCal feed", () => {
  const ics = renderCalendar("Unihub", [
    { uid: "a@unihub", title: "ממ״ן 11; פרק 2, סעיף \\3", description: "שורה 1\nשורה 2", start: { date: "2026-10-25", time: "09:00" }, end: { date: "2026-10-25", time: "10:30" }, reminderMinutes: 10 },
    { uid: "b@unihub", title: "חנוכה", date: "2026-12-06" },
  ], new Date("2026-10-24T10:00:00Z"));
  const unfolded = ics.replace(/\r\n /g, "");

  it("escapes semicolons, commas, backslashes and newlines in text", () => {
    expect(unfolded).toContain("SUMMARY:ממ״ן 11\\; פרק 2\\, סעיף \\\\3");
    expect(unfolded).toContain("DESCRIPTION:שורה 1\\nשורה 2");
  });
  it("writes timed events in Israel time and all-day events as dates", () => {
    expect(ics).toContain("DTSTART;TZID=Asia/Jerusalem:20261025T090000");
    expect(ics).toContain("DTEND;TZID=Asia/Jerusalem:20261025T103000");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261206");
    expect(ics).toContain("DTEND;VALUE=DATE:20261207");
    expect(ics).toContain("TRIGGER:-PT10M");
  });
  it("uses CRLF and folds long lines at 75 octets", () => {
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
