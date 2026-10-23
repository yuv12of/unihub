import { addDays } from "@/lib/semester";

/**
 * Hobbies: something you do for its own sake, with a weekly time you'd like to give it (placed in the
 * calendar as a flexible routine), a board of things to learn or make, and a practice log.
 */
export type HobbyKind = "music" | "sport" | "language" | "creative" | "reading" | "cooking" | "other";
export type ItemStatus = "want" | "doing" | "done";

export const KINDS: Record<HobbyKind, { label: string; emoji: string; items: string; item: string; placeholder: string }> = {
  music: { label: "נגינה", emoji: "🎸", items: "קטעים וטכניקות", item: "קטע או טכניקה", placeholder: "למשל: מעבר חלק בין אקורדים" },
  sport: { label: "ספורט", emoji: "🏃", items: "יעדים", item: "יעד", placeholder: "למשל: 5 ק״מ ברצף" },
  language: { label: "שפה", emoji: "🗣️", items: "נושאים", item: "נושא", placeholder: "למשל: זמן עבר" },
  creative: { label: "יצירה", emoji: "🎨", items: "פרויקטים", item: "פרויקט", placeholder: "למשל: סקיצה של הנוף מהחלון" },
  reading: { label: "קריאה", emoji: "📚", items: "ספרים", item: "ספר", placeholder: "שם הספר" },
  cooking: { label: "בישול", emoji: "🍳", items: "מתכונים", item: "מתכון", placeholder: "למשל: לחם מחמצת" },
  other: { label: "אחר", emoji: "✨", items: "דברים לעשות", item: "פריט", placeholder: "מה הבא?" },
};

export const STATUS: Record<ItemStatus, string> = { want: "רוצה לנסות", doing: "בתהליך", done: "הושלם" };

/** Ready-made starting points: a weekly time and a few first steps. Everything stays editable. */
export const PRESETS: { title: string; emoji: string; kind: HobbyKind; weekly: number; items: string[] }[] = [
  { title: "גיטרה", emoji: "🎸", kind: "music", weekly: 150, items: ["אקורדים פתוחים בסיסיים", "החלפת אקורדים בקצב קבוע", "דפוס פריטה בסיסי", "שיר שלם מההתחלה עד הסוף"] },
  { title: "פסנתר", emoji: "🎹", kind: "music", weekly: 150, items: ["סולמות מז׳וריים ביד ימין", "תיאום בין הידיים", "קריאת תווים במפתח סול", "קטע קצר שלם"] },
  { title: "ריצה", emoji: "🏃", kind: "sport", weekly: 120, items: ["30 דקות ריצה בלי הפסקה", "5 ק״מ ברצף", "שיפור קצב ב־5 ק״מ", "10 ק״מ"] },
  { title: "חדר כושר", emoji: "🏋️", kind: "sport", weekly: 180, items: ["תוכנית של 3 אימונים בשבוע", "טכניקה נכונה בסקוואט", "10 מתח ברצף"] },
  { title: "שפה חדשה", emoji: "🗣️", kind: "language", weekly: 105, items: ["300 המילים הנפוצות", "הצגה עצמית בעל־פה", "שיחה של 5 דקות", "סדרה עם כתוביות בשפה"] },
  { title: "ציור ורישום", emoji: "🎨", kind: "creative", weekly: 120, items: ["סקיצה יומית של 10 דקות", "פרספקטיבה בנקודה אחת", "אור וצל על כדור", "ציור שלם של חפץ מהבית"] },
  { title: "קריאה להנאה", emoji: "📚", kind: "reading", weekly: 140, items: [] },
  { title: "בישול", emoji: "🍳", kind: "cooking", weekly: 90, items: ["ארוחת ערב מלאה מאפס", "לחם בסיסי", "רוטב עגבניות ביתי"] },
];

export interface HobbyItem {
  id: string;
  hobby_id: string;
  title: string;
  kind: string;
  status: ItemStatus;
  progress: number;
  note: string | null;
  url: string | null;
  sort: number;
  done_at: string | null;
}

export interface HobbyLog {
  id: string;
  hobby_id: string;
  item_id: string | null;
  date: string;
  minutes: number;
  note: string | null;
  mood: number | null;
  routine_date: string | null;
}

export interface Hobby {
  id: string;
  title: string;
  emoji: string | null;
  kind: HobbyKind;
  weekly_minutes: number;
  routine_id: string | null;
  why: string | null;
  archived: boolean;
  created_at: string;
}

export interface HobbyStats {
  week: number;
  total: number;
  sessions: number;
  /** weeks in a row that met the weekly time (or had any practice, without a goal) */
  streak: number;
  last: string | null;
  /** minutes per week, oldest first */
  weeks: { start: string; minutes: number }[];
}

const weekStart = (d: string) => addDays(d, -new Date(d + "T00:00:00Z").getUTCDay());

export function hobbyStats(h: Hobby, logs: HobbyLog[], today: string, n = 12): HobbyStats {
  const mine = logs.filter((l) => l.hobby_id === h.id);
  const ws = weekStart(today);
  const byWeek = new Map<string, number>();
  for (const l of mine) byWeek.set(weekStart(l.date), (byWeek.get(weekStart(l.date)) ?? 0) + l.minutes);
  const met = (w: string) => (h.weekly_minutes ? (byWeek.get(w) ?? 0) >= h.weekly_minutes : (byWeek.get(w) ?? 0) > 0);
  // This week counts once it's met; until then the streak is the weeks before it.
  let streak = 0;
  for (let w = met(ws) ? ws : addDays(ws, -7); met(w) && streak < 520; w = addDays(w, -7)) streak++;
  return {
    week: byWeek.get(ws) ?? 0,
    total: mine.reduce((s, l) => s + l.minutes, 0),
    sessions: mine.length,
    streak,
    last: mine.map((l) => l.date).sort().at(-1) ?? null,
    weeks: Array.from({ length: n }, (_, i) => {
      const start = addDays(ws, -7 * (n - 1 - i));
      return { start, minutes: byWeek.get(start) ?? 0 };
    }),
  };
}

export const minutesText = (m: number) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}${r ? `:${String(r).padStart(2, "0")}` : ""} ש׳` : `${r} דק׳`;
};
