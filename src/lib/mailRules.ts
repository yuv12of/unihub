import { range } from "@/lib/time";
/**
 * Plain rules for university mail, so most mail never needs AI.
 *
 * classify() recognises routine mail (invitations, newsletters, surveys, registration notices...)
 * and gives it a category and a one-line summary. Mail it doesn't recognise is left for the AI task.
 *
 * It also spots mail that changes the schedule: a deadline extension from a tutor, a cancelled or
 * moved tutorial, a checked assignment with its grade. Those become "updates" that are applied
 * automatically when the rule is sure, or wait for one tap when it isn't.
 * Official notices arrive as scanned PDFs; their text comes from Drive OCR in the user's Apps Script.
 */
import { semester, themeOf, typeLabel, addDays, type Course } from "@/lib/semester";

export interface MailInput {
  subject: string;
  sender: string;
  body: string;
  date: string; // ISO timestamp
  attachments: { name: string; text?: string }[];
}

export interface RuleUpdate {
  kind: "deadline" | "tutorial_cancel" | "tutorial_new" | "grade" | "info";
  title: string;
  detail?: string;
  payload: Record<string, string | number | null>;
  auto?: boolean;
}

export interface RuleResult {
  category: string | null;
  summary: string | null;
  actions: { text: string; date?: string }[];
  updates: RuleUpdate[];
}

export interface TutorialLike {
  date: string;
  course_code: string | null;
  kind: string;
  start_time: string | null;
}

/** Converts the semester code to the form used in mail: "2027א" and "2027a". */
const SEM_HE = semester.semester; // "2027א"
const SEM_EN = semester.semester.replace("א", "a").replace("ב", "b").replace("ג", "c");

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const short = (s: string, n = 160) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Course of a mail: an explicit course code, or a course name. Only courses of the current semester. */
export function detectCourse(text: string, courses: Course[]): string | null {
  for (const m of text.matchAll(/\b(\d{5})\b/g)) {
    if (courses.some((c) => c.code === m[1])) return m[1];
  }
  for (const c of courses) if (text.includes(c.name)) return c.code;
  return null;
}

/** True when the mail names a different semester (old mail about a course taken again). */
function otherSemester(text: string): boolean {
  const sems = [...text.matchAll(/\b(20\d\d)\s?([אבגabc])\b/g)].map((m) => m[1] + m[2]);
  if (!sems.length) return false;
  return !sems.some((s) => s === SEM_HE || s === SEM_EN);
}

/**
 * Dates written as 29.12, 12.2.26, 23/11/2025 … → YYYY-MM-DD.
 * Without a year, the first such date on or after (reference - 30 days) is taken.
 */
export function parseDates(text: string, referenceIso: string): { iso: string; index: number }[] {
  const ref = referenceIso.slice(0, 10);
  const out: { iso: string; index: number }[] = [];
  for (const m of text.matchAll(/(?<![\d.\/])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\d\/]|\.\d)/g)) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    if (d < 1 || d > 31 || mo < 1 || mo > 12) continue;
    let y: number;
    if (m[3]) {
      y = Number(m[3]);
      if (y < 100) y += 2000;
    } else {
      y = Number(ref.slice(0, 4));
      const candidate = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (candidate < addDays(ref, -30)) y += 1;
    }
    out.push({ iso: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, index: m.index ?? 0 });
  }
  return out;
}

const TIME_RANGE = /([01]?\d|2[0-3]):([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3]):([0-5]\d)/;
const hhmm = (h: string, m: string) => `${h.padStart(2, "0")}:${m}`;

const he = (iso: string) => iso.slice(8, 10).replace(/^0/, "") + "/" + iso.slice(5, 7).replace(/^0/, "");

/**
 * The university numbers file assignments (ממ"ן) 11, 12, … and online ones (ממ"ח) 01, 02, …,
 * while Unihub lists all of a course's assignments in order. Maps the mail's number to ours.
 */
function assignmentOf(courses: Course[], code: string, n: string, word = "") {
  const course = courses.find((c) => c.code === code);
  if (!course) return null;
  const num = Number(n);
  if (/ח/.test(word)) return course.assignments.filter((a) => a.type === "online")[num - 1] ?? null;
  if (num >= 11) return course.assignments.filter((a) => a.type === "file")[num - 11] ?? null;
  return course.assignments.find((a) => Number(a.n) === num) ?? null;
}

/** Routine mail: category + summary, without AI. null category = leave it for the AI task. */
function classify(subject: string, sender: string, body: string, courses: Course[]): Pick<RuleResult, "category" | "summary" | "actions"> {
  const s = clean(subject);
  const none = { category: null, summary: null, actions: [] };

  // Exam schedule notices carry dates the AI task reads from the attachment.
  if (/מועדי בחינות/.test(s)) return none;

  if (/sekerOU/i.test(sender) || /סקר הערכת קורס/.test(s))
    return { category: "אחר", summary: "סקר הערכת קורס. רשות, לא חובה.", actions: [] };

  const forum = s.match(/הודעה מפורום הקורס\s*"([^"]+)"\s*בנושא\s*"(.+)"?$/);
  if (forum) {
    const topic = forum[2].replace(/"$/, "");
    return {
      category: /בחינ/.test(topic) ? "בחינות" : "קורס",
      summary: short(`פורום ${forum[1]}: ${topic}`),
      actions: [],
    };
  }
  if (/ממתינים לך באתר הקורס/.test(s)) return { category: "קורס", summary: short(s.replace(/^[^,]+,\s*/, "")), actions: [] };

  const notebook = s.match(/^מחברת מפגש\s*(\d+)/);
  if (notebook) {
    const code = detectCourse(body, courses);
    return {
      category: "קורס",
      summary: `המנחה שלח את מחברת מפגש ${notebook[1]}${code ? ` ב${themeOf(courses, code).short}` : ""} (קובץ מצורף).`,
      actions: [],
    };
  }
  if (/ערכת הלימוד שלך בדרכה/.test(s)) return { category: "קורס", summary: "ערכת הלימוד נשלחה, בדרך לסניף הדואר.", actions: [] };
  if (/קבלות? מס/.test(s)) return { category: "תשלומים", summary: "קבלות מס מצורפות. לשמירה בלבד.", actions: [] };
  if (/^תעודת סטודנט$|תעודת סטודנט דיגיטלית/.test(s)) return { category: "מנהלה", summary: short(s) + ".", actions: [] };
  if (/^אישור הרשמה$/.test(s)) return { category: "מנהלה", summary: "אישור הרשמה לקורסים (מסמך מצורף).", actions: [] };
  if (/עדכון על מצב לימודים/.test(s)) return { category: "מנהלה", summary: "עדכון על מצב הלימודים בקורס (מסמך מצורף).", actions: [] };
  if (/(פתיחת|סיום|תזכורת).{0,25}הרשמה.{0,30}סמסטר|הרשמה (סדירה|מאוחרת)/.test(s))
    return { category: "מנהלה", summary: short(s) + ".", actions: [] };
  if (/מלג(ה|ת|ות)/.test(s)) return { category: "מלגות", summary: short(s) + ".", actions: [] };
  if (/ניוזלטר|הטבת|הירשמו לסדנאות|קורסים גמישים|הדרכות אישיות|הזדמנויות תעסוקה|איך ייראו הלימודים/.test(s))
    return { category: "שיווק", summary: short(s) + ".", actions: [] };
  if (
    /^\s*הזמנה|קונצרט|ערב עיון|הרצא|סדנ|מפגש זרקור|מפגש היכרות|תערוכה|מועדון|יום הדאטה|שבוע מודעות|מפגשי חשיפה|התמודדות במצבי לחץ/.test(s) &&
    !detectCourse(s, courses)
  )
    return { category: "אירועים", summary: short(s) + ".", actions: [] };

  return none;
}

/**
 * Runs all rules on one mail. `tutorials` are the user's known tutorial meetings, used to tell
 * which date in a cancellation notice is the cancelled meeting.
 */
export function runMailRules(mail: MailInput, tutorials: TutorialLike[], today: string, courses: Course[]): RuleResult {
  const subject = clean(mail.subject ?? "");
  const pdfText = mail.attachments.map((a) => a.text ?? "").join("\n");
  const all = `${subject}\n${mail.body ?? ""}\n${pdfText}`;
  const base = classify(subject, mail.sender, mail.body ?? "", courses);
  const result: RuleResult = { ...base, updates: [] };

  // Only fresh mail about this semester changes the schedule (old mail is just kept for reading).
  const fresh = mail.date.slice(0, 10) >= addDays(today, -14);
  if (!fresh || otherSemester(all)) return result;
  const code = detectCourse(all, courses);

  // 1. Deadline extension: "מועד הגשת מטלה 13 נדחה ל- 29.12", "ממ"ן 12 יוגש עד 10.12".
  const ext = all.match(/(מטלה|ממ["״']?[נןח])\s*(\d{1,2})[^\n]{0,40}?(?:נדח[הית]+|הוארך|יוארך|מוארך|יוגש עד)[^\d\n]{0,15}(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)/);
  if (ext && code) {
    const a = assignmentOf(courses, code, ext[2], ext[1]);
    const due = parseDates(ext[3], mail.date)[0]?.iso;
    if (a && due && due !== a.due) {
      const label = `${typeLabel[a.type]} ${a.n} ב${themeOf(courses, code).short}`;
      result.updates.push({
        kind: "deadline",
        title: `${label} נדחה ל־${he(due)}`,
        detail: `במקור ${he(a.due)}. התוכנית עודכנה בהתאם.`,
        payload: { course_code: code, n: a.n, due },
        auto: true,
      });
      result.category ??= "קורס";
      result.summary ??= `מועד ההגשה של ${label} נדחה ל־${he(due)}.`;
    }
  }

  // 2. Tutorial cancelled / moved.
  if (/ביטול מפגש|מפגש.{0,10}(בוטל|יבוטל|נדחה)|שינוי (מועד|במועד) (ה)?מפגש|מפגש חלופי/.test(all)) {
    const source = pdfText || mail.body || "";
    const dates = parseDates(source, mail.date).filter((d) => d.iso > mail.date.slice(0, 10));
    const known = (iso: string) =>
      tutorials.find((t) => t.kind === "tutorial" && t.date === iso && (!code || !t.course_code || t.course_code === code));
    const cancelled = dates.find((d) => known(d.iso));
    const timeAfter = (d: { index: number }) => source.slice(d.index, d.index + 80).match(TIME_RANGE);
    const replacement = dates.find((d) => d.iso !== cancelled?.iso && !known(d.iso) && timeAfter(d));
    const name = code ? ` ב${themeOf(courses, code).short}` : "";
    if (cancelled) {
      const t = known(cancelled.iso)!;
      result.updates.push({
        kind: "tutorial_cancel",
        title: `מפגש ההנחיה${name} ב־${he(cancelled.iso)} בוטל`,
        detail: "סומן כמבוטל בלוח השנה, והזמן התפנה ללימוד.",
        payload: { date: cancelled.iso, course_code: t.course_code ?? code },
        auto: true,
      });
    }
    if (replacement) {
      const near = timeAfter(replacement);
      if (near) {
        result.updates.push({
          kind: "tutorial_new",
          title: `מפגש חלופי${name} ב־${he(replacement.iso)}, ${range(hhmm(near[1], near[2]), hhmm(near[3], near[4]))}`,
          detail: "נוסף ללוח השנה.",
          payload: {
            date: replacement.iso,
            start: hhmm(near[1], near[2]),
            end: hhmm(near[3], near[4]),
            course_code: code,
            title: `מפגש הנחיה (חלופי)${name}`,
          },
          auto: true,
        });
      }
    }
    if (!cancelled && !replacement)
      result.updates.push({
        kind: "info",
        title: `שינוי במפגש הנחיה${name}`,
        detail: "לא הצלחתי לקרוא את התאריכים מהמסמך. כדאי לפתוח את המייל.",
        payload: { subject: short(subject, 120) },
      });
    result.category ??= "קורס";
    result.summary ??= cancelled
      ? `מפגש ההנחיה${name} ב־${he(cancelled.iso)} בוטל${replacement ? `, מפגש חלופי ב־${he(replacement.iso)}` : ""}.`
      : `הודעה על שינוי במפגש הנחיה${name}.`;
  }

  // 3. Assignment checked: grade from the attached letter.
  if (/סיום בדיקת מטלה|בדיקת המטלה הסתיימה/.test(subject)) {
    const nm = pdfText.match(/(מטלה|ממ["״']?[נןח])\s*(?:מס['׳]?\s*)?(\d{1,2})/);
    const grade = pdfText.match(/ציון[^\d\n]{0,12}(\d{1,3})(?!\d)/)?.[1];
    const a = code && nm ? assignmentOf(courses, code, nm[2], nm[1]) : null;
    if (a && grade && Number(grade) <= 100) {
      const label = `${typeLabel[a.type]} ${a.n} ב${themeOf(courses, code).short}`;
      result.updates.push({
        kind: "grade",
        title: `ציון ${grade} ב${label}`,
        detail: "לחצו כדי לרשום את הציון ולסמן שהמטלה הוגשה.",
        payload: { course_code: code, n: a.n, grade: Number(grade) },
      });
      result.category ??= "קורס";
      result.summary ??= `${label} נבדקה. הציון: ${grade}.`;
    } else {
      result.category ??= "קורס";
      result.summary ??= "אחת המטלות נבדקה. הציון במסמך המצורף ובשאילתא.";
    }
  }

  // 4. Exam registration deadline reminder.
  if (/תאריך אחרון להרשמה לבחינה/.test(subject)) {
    const around = pdfText.match(/אחרון[^\n]{0,60}/)?.[0] ?? "";
    const last = parseDates(around || pdfText, mail.date)[0]?.iso;
    result.category ??= "בחינות";
    result.summary ??= last ? `תזכורת: ההרשמה לבחינה נסגרת ב־${he(last)}.` : "תזכורת על תאריך אחרון להרשמה לבחינה (בקובץ המצורף).";
    result.actions = [{ text: "לוודא הרשמה לבחינה בשאילתא", ...(last ? { date: last } : {}) }];
  }

  return result;
}
