import { describe, expect, it } from "vitest";
import { occurrencesFor, planFor } from "@/lib/planfor";
import { expandRoutines, routineBusy, type Routine } from "@/lib/routines";
import { SLEEP_IN_TITLE, sleepInFor } from "@/lib/sleepIn";
import { courses, events, prefs, routines } from "./fixtures/owner";

const plan = (today: string, rs: Routine[] = routines, evs = events) =>
  planFor({ today, prefs, progress: {}, exams: [], events: evs, rows: [], courses, routines: rs });
const withOv = (id: string, ov: Routine["overrides"]) => routines.map((r) => (r.id === id ? { ...r, overrides: ov } : r));
const occ = (rs: Routine[], from: string, to: string, evs = events) =>
  occurrencesFor({ routines: rs, logs: [], events: evs, plan: plan("2026-10-25", rs, evs), today: "2026-10-25", from, to });

describe("routine overrides", () => {
  it("move: lunch at 10:00 on Tuesday reshapes that morning's study", () => {
    const rs = withOv("lunch", { "2026-10-27": { start: "10:00" } });
    const lunch = occ(rs, "2026-10-27", "2026-10-27").find((o) => o.routineId === "lunch")!;
    expect([lunch.start, lunch.moved]).toEqual(["10:00", true]);
    for (const s of plan("2026-10-25", rs).sessions.filter((s) => s.date === "2026-10-27")) expect(s.end <= "10:00" || s.start >= "10:45").toBe(true);
  });
  it("move to another day keeps the original date as its key", () => {
    const rs = withOv("dinner", { "2026-10-28": { date: "2026-10-30" } });
    const d = occ(rs, "2026-10-25", "2026-10-31").filter((o) => o.routineId === "dinner");
    expect(d.find((o) => o.date === "2026-10-28")).toBeUndefined();
    expect(d.find((o) => o.date === "2026-10-30")?.key).toBe("2026-10-28");
  });
  it("skip: no occurrence and no busy time that day", () => {
    const rs = withOv("lunch", { "2026-10-27": { skip: true } });
    expect(occ(rs, "2026-10-27", "2026-10-27").some((o) => o.routineId === "lunch")).toBe(false);
    expect(routineBusy(rs, "2026-10-27", "2026-10-27").some((b) => b.start === "13:00")).toBe(false);
  });
  it("pin: a flexible routine pinned to a day and time stays there and blocks study", () => {
    const rs = withOv("social", { "2026-10-27": { start: "19:00", minutes: 120 } });
    const s = occ(rs, "2026-10-25", "2026-10-31").filter((o) => o.routineId === "social");
    expect(s.map((o) => `${o.date}@${o.start}`)).toEqual(["2026-10-27@19:00"]);
    expect(routineBusy(rs, "2026-10-27", "2026-10-27")).toContainEqual({ date: "2026-10-27", start: "19:00", end: "21:00" });
  });
  it("a sleep routine crossing midnight is split at midnight", () => {
    const rs = routines.map((r) => (r.id === "sleep" ? { ...r, start_time: "23:30", minutes: 450 } : r));
    const busy = routineBusy(rs, "2026-10-26", "2026-10-26").filter((b) => b.start === "00:00" || b.start === "23:30");
    expect(busy).toContainEqual({ date: "2026-10-26", start: "00:00", end: "07:00" });
    expect(busy).toContainEqual({ date: "2026-10-26", start: "23:30", end: "23:59" });
    const o = expandRoutines({ routines: rs, logs: [], from: "2026-10-26", to: "2026-10-26", today: "2026-10-25" }).filter((x) => x.category === "sleep");
    expect(o.length).toBeGreaterThan(0);
  });
});

describe("sleep-in", () => {
  const sleepIn = { date: "2026-10-26", start_time: "08:00", end_time: "09:00", kind: "custom", title: SLEEP_IN_TITLE, source: "manual", cancelled: false };
  it("an accepted sleep-in moves wake-up and breakfast after it, and study starts later", () => {
    const evs = [...events, sleepIn];
    const o = occ(routines, "2026-10-26", "2026-10-26", evs);
    expect(o.find((x) => x.routineId === "wake")?.start).toBe("09:00");
    expect(o.find((x) => x.routineId === "bfast")?.start).toBe("09:20");
    const first = plan("2026-10-25", routines, evs).sessions.find((s) => s.date === "2026-10-26")!;
    expect(first.start >= "09:45").toBe(true);
  });
  it("is offered after a late tutorial with a light morning, not before a deadline", () => {
    // Sunday 25.10: tutorial till 21:00, Monday light, nothing due on 26–27.10.
    const p = plan("2026-10-25");
    const s = sleepInFor({ today: "2026-10-25", routines, plan: p, events, courses, exams: [] });
    expect(s).toMatchObject({ date: "2026-10-26", from: "08:00", until: "09:00", accepted: false });
    // 10.11 (tutorial till 21:00) is the night before two deadlines on 12.11: no offer.
    const p2 = plan("2026-11-10");
    expect(sleepInFor({ today: "2026-11-10", routines, plan: p2, events, courses, exams: [] })).toBeNull();
    // No late evening on Tuesday 27.10: no offer.
    expect(sleepInFor({ today: "2026-10-27", routines, plan: plan("2026-10-27"), events, courses, exams: [] })).toBeNull();
  });
  it("an accepted one is reported as accepted, and a rough day gets none", () => {
    const evs = [...events, sleepIn];
    expect(sleepInFor({ today: "2026-10-25", routines, plan: plan("2026-10-25", routines, evs), events: evs, courses, exams: [] })?.accepted).toBe(true);
    expect(sleepInFor({ today: "2026-10-25", routines, plan: plan("2026-10-25"), events, courses, exams: [], offDays: ["2026-10-26"] })).toBeNull();
  });
});
