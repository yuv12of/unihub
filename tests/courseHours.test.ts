import { describe, expect, it } from "vitest";
import { courseHours } from "@/lib/courseHours";
import { planFor } from "@/lib/planfor";
import { prepMinutes, sessionKey } from "@/lib/planner";
import { progressKey } from "@/lib/progress";
import { courses, events, prefs, routines } from "./fixtures/owner";

describe("courseHours", () => {
  const today = "2026-10-27";
  const p = planFor({ today, prefs, progress: {}, exams: [], events, rows: [], courses, routines });
  const ds = courses.find((c) => c.code === "20407")!;

  it("adds up done, scheduled and missing prep per assignment", () => {
    const first = p.sessions.find((s) => s.courseCode === "20407" && s.kind === "assignment" && s.ref === "a01")!;
    const rows = [
      { session_key: "2026-10-25|assignment|20407|a01", status: "done", minutes: 90 },
      { session_key: "2026-10-26|assignment|20407|a01-2", status: "done", minutes: 30 }, // a repeat session on one day
      { session_key: "2026-10-26|log|20407|1", status: "done", minutes: 45 },
      { session_key: sessionKey(first), status: "skipped", minutes: null },
    ];
    const h = courseHours({ course: ds, plan: p, rows, progress: {}, today });
    const a01 = h.assignments.find((a) => a.n === "01")!;
    expect(a01.need).toBe(prepMinutes("file", 5));
    expect(a01.done).toBe(120);
    const scheduled = p.sessions
      .filter((s) => s.courseCode === "20407" && s.kind === "assignment" && s.ref?.startsWith("a01") && s.date >= today && sessionKey(s) !== sessionKey(first))
      .reduce((n, s) => n + s.minutes, 0);
    expect(a01.scheduled).toBe(scheduled);
    expect(a01.missing).toBe(Math.max(0, a01.need - 120 - scheduled));
    expect(h.weekDone).toBe(90 + 30 + 45);
    expect(h.history).toHaveLength(8);
    expect(h.history.at(-1)).toEqual({ week: "2026-10-25", minutes: 165 });
  });

  it("leaves out submitted and past assignments", () => {
    const submitted = courseHours({ course: ds, plan: p, rows: [], progress: { [progressKey("20407", "01")]: { status: "submitted" } } as never, today });
    expect(submitted.assignments.map((a) => a.n)).not.toContain("01");
    expect(submitted.assignments.map((a) => a.n)).toContain("02");
    const later = courseHours({ course: ds, plan: p, rows: [], progress: {}, today: "2026-11-27" });
    expect(later.assignments.map((a) => a.n)).not.toContain("02");
  });
});
