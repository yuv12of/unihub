/**
 * Badges are computed from what the app already knows (no extra tracking). Each has a target and the
 * current value, so locked badges can show progress. For friends, only badges whose data they share
 * are computed.
 */
import { addDays } from "@/lib/semester";
import { standing, progressKey, type ProgressMap } from "@/lib/progress";
import { streak, weekStart, type Routine, type RoutineLog } from "@/lib/routines";
import type { Course } from "@/lib/semester";

export interface BadgeStats {
  today: string;
  /** study minutes per day (sessions marked done); undefined = not shared */
  studyDays?: Record<string, number>;
  weeklyGoal?: number | null;
  courses?: Course[];
  progress?: ProgressMap;
  routines?: Routine[];
  logs?: RoutineLog[];
  offDays?: string[];
  friends?: number;
  cheersSent?: number;
  cheersReceived?: number;
}

export interface Badge {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  value: number;
  target: number;
  earned: boolean;
  group: "study" | "courses" | "routines" | "social";
}

function longestStreak(days: Record<string, number>): number {
  const dates = Object.keys(days).filter((d) => days[d] > 0).sort();
  let best = 0;
  let cur = 0;
  let prev = "";
  for (const d of dates) {
    cur = prev && addDays(prev, 1) === d ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

function weeksTotals(days: Record<string, number>): Map<string, number> {
  const m = new Map<string, number>();
  for (const [d, min] of Object.entries(days)) m.set(weekStart(d), (m.get(weekStart(d)) ?? 0) + min);
  return m;
}

export function computeBadges(s: BadgeStats): Badge[] {
  const out: Badge[] = [];
  const add = (b: Omit<Badge, "earned">) => out.push({ ...b, value: Math.min(b.value, b.target), earned: b.value >= b.target });

  if (s.studyDays) {
    const days = s.studyDays;
    const totalMin = Object.values(days).reduce((n, m) => n + m, 0);
    const sessions = Object.values(days).filter((m) => m > 0).length;
    const bestDay = Math.max(0, ...Object.values(days));
    const weeks = weeksTotals(days);
    add({ id: "first", emoji: "🌱", title: "צעד ראשון", desc: "יום לימוד ראשון שסומן", value: sessions, target: 1, group: "study" });
    add({ id: "h10", emoji: "📘", title: "10 שעות", desc: "10 שעות לימוד בסך הכל", value: Math.floor(totalMin / 60), target: 10, group: "study" });
    add({ id: "h50", emoji: "📚", title: "50 שעות", desc: "50 שעות לימוד בסך הכל", value: Math.floor(totalMin / 60), target: 50, group: "study" });
    add({ id: "h100", emoji: "🏛️", title: "100 שעות", desc: "100 שעות לימוד בסך הכל", value: Math.floor(totalMin / 60), target: 100, group: "study" });
    add({ id: "streak7", emoji: "🔥", title: "שבוע ברצף", desc: "7 ימי לימוד רצופים", value: longestStreak(days), target: 7, group: "study" });
    add({ id: "streak21", emoji: "☄️", title: "שלושה שבועות ברצף", desc: "21 ימי לימוד רצופים", value: longestStreak(days), target: 21, group: "study" });
    add({ id: "marathon", emoji: "🏃", title: "מרתון", desc: "4 שעות לימוד ביום אחד", value: Math.floor(bestDay / 60), target: 4, group: "study" });
    add({ id: "week10", emoji: "💪", title: "שבוע חזק", desc: "10 שעות לימוד בשבוע אחד", value: Math.floor(Math.max(0, ...weeks.values()) / 60), target: 10, group: "study" });
    if (s.weeklyGoal)
      add({
        id: "goal",
        emoji: "🎯",
        title: "עמדת ביעד",
        desc: `הגעת ליעד השבועי (${Math.round(s.weeklyGoal / 60)} ש׳)`,
        value: [...weeks.values()].filter((m) => m >= s.weeklyGoal!).length,
        target: 1,
        group: "study",
      });
    if (s.offDays?.length) {
      const back = s.offDays.some((d) => (days[addDays(d, 1)] ?? 0) > 0 || (days[addDays(d, 2)] ?? 0) > 0);
      add({ id: "comeback", emoji: "🌤️", title: "קמת וחזרת", desc: "חזרת ללמוד אחרי יום קשה", value: back ? 1 : 0, target: 1, group: "study" });
    }
  }

  if (s.courses && s.progress) {
    const p = s.progress;
    const subs = s.courses.flatMap((c) => c.assignments.map((a) => p[progressKey(c.code, a.n)])).filter((x) => x?.status === "submitted");
    add({ id: "submit1", emoji: "📮", title: "הגשה ראשונה", desc: "מטלה ראשונה הוגשה", value: subs.length, target: 1, group: "courses" });
    add({ id: "submit10", emoji: "📬", title: "עשר הגשות", desc: "10 מטלות הוגשו", value: subs.length, target: 10, group: "courses" });
    const grades = subs.map((x) => x!.grade).filter((g): g is number => g != null);
    if (grades.length || subs.length) {
      add({ id: "ace", emoji: "⭐", title: "מצטיין/ת", desc: "ציון 95 ומעלה במטלה", value: grades.some((g) => g >= 95) ? 1 : 0, target: 1, group: "courses" });
      add({ id: "perfect", emoji: "💯", title: "מאה!", desc: "ציון 100 במטלה", value: grades.some((g) => g >= 100) ? 1 : 0, target: 1, group: "courses" });
    }
    const safe = s.courses.filter((c) => standing(c, p, s.today).needed === 0).length;
    add({ id: "safe", emoji: "🛡️", title: "בטוח/ה בקורס", desc: "עברת את מינימום המטלות בקורס", value: safe, target: 1, group: "courses" });
  }

  if (s.routines && s.logs) {
    const active = s.routines.filter((r) => r.active);
    const best = Math.max(0, ...active.map((r) => {
      const st = streak(r, s.logs!, s.today, s.offDays ?? []);
      return st.unit === "weeks" ? st.count * 7 : st.count;
    }));
    add({ id: "habits3", emoji: "🧩", title: "בונה שגרה", desc: "3 שגרות פעילות", value: active.length, target: 3, group: "routines" });
    add({ id: "rstreak14", emoji: "🌿", title: "שבועיים של שגרה", desc: "רצף של שבועיים בשגרה אחת", value: best, target: 14, group: "routines" });
    add({ id: "rstreak60", emoji: "🌳", title: "חודשיים של שגרה", desc: "רצף של חודשיים בשגרה אחת", value: best, target: 60, group: "routines" });
    const ticks = s.logs.filter((l) => l.date >= addDays(s.today, -6)).length;
    add({ id: "ticks20", emoji: "✅", title: "שבוע מסודר", desc: "20 סימונים בשגרה בשבוע אחד", value: ticks, target: 20, group: "routines" });
  }

  if (s.friends != null) add({ id: "friend1", emoji: "🤝", title: "חבר/ה ראשון/ה", desc: "חיבור ראשון ב־Unihub", value: s.friends, target: 1, group: "social" });
  if (s.friends != null) add({ id: "friend5", emoji: "👯", title: "חבורה", desc: "5 חברים ב־Unihub", value: s.friends, target: 5, group: "social" });
  if (s.cheersSent != null) add({ id: "cheer10", emoji: "📣", title: "מעודד/ת", desc: "שלחת 10 פרגונים", value: s.cheersSent, target: 10, group: "social" });
  if (s.cheersReceived != null) add({ id: "loved", emoji: "💛", title: "אהוב/ה", desc: "קיבלת 10 פרגונים", value: s.cheersReceived, target: 10, group: "social" });

  return out;
}

export const BADGE_GROUPS: Record<Badge["group"], string> = {
  study: "לימוד",
  courses: "קורסים",
  routines: "שגרה",
  social: "חברים",
};
