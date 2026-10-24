import { describe, expect, it } from "vitest";
import { academicEvents } from "@/lib/academic";
import { CURRENT_SEMESTER, SEMESTERS, semester } from "@/lib/semester";

describe("semesters", () => {
  it("exactly one is current, and the app's semester code comes from it", () => {
    expect(SEMESTERS.filter((s) => s.current)).toHaveLength(1);
    expect(semester.semester).toBe(CURRENT_SEMESTER.code);
    expect(CURRENT_SEMESTER.code).toBe("2027א");
  });
  it("dates match the university's academic calendar", () => {
    for (const s of SEMESTERS) {
      expect(s.starts < s.ends).toBe(true);
      const label = s.code.endsWith("א") ? s.code : `ב${s.code.slice(0, 4)}`;
      expect(academicEvents.find((e) => e.title.startsWith("תחילת סמסטר") && e.title.includes(label))?.date).toBe(s.starts);
      expect(academicEvents.find((e) => e.title.startsWith("סיום סמסטר") && e.title.includes(label))?.date).toBe(s.ends);
    }
  });
});
