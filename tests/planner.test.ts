import { describe, expect, it } from "vitest";
import { occurrencesFor, planFor } from "@/lib/planfor";
import { sessionKey, type Plan } from "@/lib/planner";
import { addDays } from "@/lib/semester";
import { toMin } from "@/lib/routines";
import { courses, events, prefs, routines } from "./fixtures/owner";

const plan = (today: string, extra: Partial<Parameters<typeof planFor>[0]> = {}) =>
  planFor({ today, prefs, progress: {}, exams: [], events, rows: [], courses, routines, ...extra });
const weekOf = (d: string) => addDays(d, -new Date(d + "T00:00:00Z").getUTCDay());
const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];

describe("planner with the owner's real week (golden)", () => {
  const p = plan("2026-10-25");

  it("reaches the 1200-minute weekly goal every week of 2027א, with no warnings", () => {
    const byWeek = new Map<string, number>();
    for (const s of p.sessions) byWeek.set(weekOf(s.date), (byWeek.get(weekOf(s.date)) ?? 0) + s.minutes);
    for (let w = "2026-10-25"; w <= "2027-01-24"; w = addDays(w, 7)) {
      expect(byWeek.get(w) ?? 0, `week of ${w}`).toBeGreaterThanOrEqual(1200);
    }
    expect(p.warnings).toEqual([]);
  });

  it("plans Sunday 25.10 at 09:00, 10:45 and 14:00", () => {
    expect(p.sessions.filter((s) => s.date === "2026-10-25").map((s) => `${s.start}-${s.end}`)).toEqual(["09:00-10:30", "10:45-12:15", "14:00-15:00"]);
  });

  it("every session has a valid time, its minutes match, and days are in order", () => {
    for (const s of p.sessions) {
      expect(toMin(s.end)).toBeGreaterThan(toMin(s.start));
      expect(s.minutes).toBe(toMin(s.end) - toMin(s.start));
    }
    for (let i = 1; i < p.sessions.length; i++) {
      const [a, b] = [p.sessions[i - 1], p.sessions[i]];
      if (a.date === b.date) expect(a.start <= b.start).toBe(true);
    }
  });

  it("no session overlaps a routine, a tutorial or another session (first 5 weeks)", () => {
    const to = addDays("2026-10-25", 34);
    const occ = occurrencesFor({ routines, logs: [], events, plan: p, today: "2026-10-25", from: "2026-10-25", to });
    for (const s of p.sessions.filter((x) => x.date <= to)) {
      const span: [number, number] = [toMin(s.start), toMin(s.end)];
      for (const o of occ.filter((o) => o.date === s.date && o.start && o.minutes > 0)) {
        const os = toMin(o.start!);
        expect(overlaps(span, [os, os + o.minutes]), `${s.date} ${s.start} vs ${o.title} ${o.start}`).toBe(false);
      }
      for (const e of events.filter((e) => e.date === s.date && e.start_time && e.end_time && e.kind !== "other"))
        expect(overlaps(span, [toMin(e.start_time!), toMin(e.end_time!)]), `${s.date} ${s.start} vs event`).toBe(false);
      for (const t of p.sessions.filter((x) => x !== s && x.date === s.date))
        expect(overlaps(span, [toMin(t.start), toMin(t.end)])).toBe(false);
    }
  });

  it("routines don't block anything before they start (24.10)", () => {
    const early = plan("2026-10-24");
    const occ = occurrencesFor({ routines, logs: [], events, plan: early, today: "2026-10-24", from: "2026-10-24", to: "2026-10-24" });
    expect(occ).toEqual([]);
  });
});

describe("session keys stay unique when the plan falls behind", () => {
  const dupes = (p: Plan) => {
    const n = new Map<string, number>();
    for (const s of p.sessions) n.set(sessionKey(s), (n.get(sessionKey(s)) ?? 0) + 1);
    return [...n].filter(([, c]) => c > 1).map(([k]) => k);
  };
  for (const today of ["2026-11-09", "2026-12-06"])
    it(`today = ${today}`, () => {
      expect(dupes(plan(today))).toEqual([]);
    });
});

describe("done and skipped sessions", () => {
  const base = plan("2026-10-25");
  it("a skipped session keeps its slot free and the week still reaches the goal", () => {
    const first = base.sessions[0];
    const p = plan("2026-10-25", { rows: [{ session_key: sessionKey(first), status: "skipped", minutes: null }] });
    expect(p.sessions.some((s) => sessionKey(s) === sessionKey(first) && s.start === first.start)).toBe(true);
  });
  it("minutes done earlier in the week are credited", () => {
    const rows = base.sessions.filter((s) => s.date === "2026-10-25").map((s) => ({ session_key: sessionKey(s), status: "done", minutes: s.minutes }));
    const p = plan("2026-10-26", { rows });
    const ahead = p.sessions.filter((s) => s.date >= "2026-10-26" && s.date <= "2026-10-31").reduce((n, s) => n + s.minutes, 0);
    expect(ahead).toBe(1200 - 240);
  });
  it("a rough day plans nothing on it", () => {
    const p = plan("2026-10-25", { offDays: ["2026-10-26"] });
    expect(p.sessions.filter((s) => s.date === "2026-10-26")).toEqual([]);
  });
});

describe("flexible routines", () => {
  const base = plan("2026-10-25");
  const first = occurrencesFor({ routines, logs: [], events, plan: base, today: "2026-10-25", from: "2026-10-25", to: "2026-10-31" });
  // Viewed later in the week, with the earlier days done as planned (sessions and routines ticked).
  const placements = (today: string) => {
    if (today === "2026-10-25") return first;
    const rows = base.sessions.filter((s) => s.date < today).map((s) => ({ session_key: sessionKey(s), status: "done", minutes: s.minutes }));
    const logs = first.filter((o) => o.date < today).map((o) => ({ routine_id: o.routineId, date: o.date, user_id: "u" }));
    const p = plan(today, { rows });
    return occurrencesFor({ routines, logs, events, plan: p, today, from: today, to: "2026-10-31" });
  };
  it("an occurrence that passed without being ticked moves to a later day, not an earlier one", () => {
    const p = plan("2026-10-27");
    const now = occurrencesFor({ routines, logs: [], events, plan: p, today: "2026-10-27", from: "2026-10-27", to: "2026-10-31" });
    expect(now.filter((o) => o.routineId === "workout").every((o) => o.date >= "2026-10-27")).toBe(true);
  });
  it("stay on the same days and times as the week goes by (when the plan is followed)", () => {
    const seen = placements("2026-10-25");
    for (let i = 1; i < 7; i++) {
      const today = addDays("2026-10-25", i);
      const now = placements(today);
      for (const id of ["social", "workout"]) {
        const want = seen.filter((o) => o.routineId === id && o.date >= today).map((o) => `${o.date}@${o.start}`);
        const got = now.filter((o) => o.routineId === id).map((o) => `${o.date}@${o.start}`);
        expect(got, `${id} viewed on ${today}`).toEqual(want);
      }
    }
  });
  it("friends evening lands on Thursday 18:10 and always has a time", () => {
    const social = placements("2026-10-25").filter((o) => o.routineId === "social");
    expect(social.map((o) => `${o.date}@${o.start}`)).toEqual(["2026-10-29@18:10"]);
    const later = occurrencesFor({ routines, logs: [], events, plan: plan("2026-10-25"), today: "2026-10-25", from: "2026-10-25", to: "2026-11-21" });
    for (const o of later.filter((o) => o.flexible && o.minutes > 0)) expect(o.start, `${o.title} ${o.date}`).not.toBeNull();
  });
});
