import { Suspense } from "react";
import { connection } from "next/server";
import { headers } from "next/headers";
import { resetFeed, saveExams, savePrefs } from "@/app/actions";
import { CopyField, SaveButton } from "@/components/FormBits";
import { getExams, getFeedToken, getPrefs } from "@/lib/userdata";
import { supabaseEnabled } from "@/lib/supabase/config";
import { courseTheme, semester } from "@/lib/semester";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const DURATIONS = [30, 60, 90, 120, 150, 180, 240, 300, 360];
const SESSION = [45, 60, 90, 120];

export default function SettingsPage() {
  return (
    <>
      <h1 className="font-display text-4xl">הגדרות</h1>
      <p className="mt-2 text-ink-soft">מתי יש לך זמן ללמוד, מתי הבחינות, ואיך התוכנית מגיעה ליומן.</p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Settings />
      </Suspense>
    </>
  );
}

const field = "rounded-lg border border-rule bg-surface px-3 py-2";

async function Settings() {
  await connection();
  if (!supabaseEnabled) return <p className="mt-8">ההגדרות זמינות אחרי התחברות.</p>;
  const [prefs, exams, token] = await Promise.all([getPrefs(), getExams(), getFeedToken()]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const feedUrl = token ? `${origin}/api/calendar/${token}` : null;
  const examOf = (code: string, moed: string) => exams.find((e) => e.course_code === code && e.moed === moed);

  return (
    <div className="mt-8 grid items-start gap-6 xl:grid-cols-2">
      <section className="panel p-5 sm:p-6" aria-labelledby="avail-title">
        <h2 id="avail-title" className="text-lg font-semibold">
          זמני לימוד
        </h2>
        <p className="mt-1 text-sm text-ink-soft">התוכנית משבצת מפגשי לימוד רק בזמנים האלה.</p>
        <form action={savePrefs} className="mt-5 space-y-5">
          <div className="divide-y divide-rule border-y border-rule">
            {DAYS.map((name, d) => {
              const slot = prefs.availability[String(d)] ?? { start: "18:00", minutes: 0 };
              return (
                <div key={d} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <label className="flex w-24 items-center gap-2 font-medium">
                    <input type="checkbox" name={`on-${d}`} defaultChecked={slot.minutes > 0} className="size-4" />
                    {name}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink-soft">
                    מ־
                    <input type="time" name={`start-${d}`} defaultValue={slot.start} className={field} dir="ltr" />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink-soft">
                    למשך
                    <select
                      name={`minutes-${d}`}
                      defaultValue={slot.minutes > 0 ? slot.minutes : 120}
                      className={field}
                    >
                      {DURATIONS.map((m) => (
                        <option key={m} value={m}>
                          {m < 60 ? `${m} דק׳` : `${m / 60} ש׳`}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              );
            })}
          </div>
          <label className="flex items-center gap-3">
            אורך מפגש לימוד
            <select name="session_minutes" defaultValue={prefs.session_minutes} className={field}>
              {SESSION.map((m) => (
                <option key={m} value={m}>
                  {m} דקות
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="fill_routine" defaultChecked={prefs.fill_routine} className="mt-1 size-4" />
            <span>
              למלא זמן פנוי בלימוד שוטף
              <span className="block text-sm text-ink-soft">
                בימים בלי הכנה למטלה או לבחינה, התוכנית מסבבת בין הקורסים.
              </span>
            </span>
          </label>
          <SaveButton />
        </form>
      </section>

      <div className="space-y-6">
        <section className="panel p-5 sm:p-6" aria-labelledby="exam-title">
          <h2 id="exam-title" className="text-lg font-semibold">
            מועדי בחינה
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            המועדים לסמסטר {semester.semester} עוד לא פורסמו. כשיופיעו בשאילתא, הזינו אותם כאן והתוכנית תתחיל
            חזרות שלושה שבועות לפני כל בחינה.
          </p>
          <form action={saveExams} className="mt-5 space-y-5">
            {semester.courses.map((c) => (
              <fieldset key={c.code}>
                <legend className="flex items-center gap-2 font-medium">
                  <span className="size-2.5 rounded-full" style={{ background: courseTheme[c.code].color }} />
                  {c.name}
                </legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {["א", "ב"].map((moed) => {
                    const e = examOf(c.code, moed);
                    return (
                      <div key={moed} className="flex items-center gap-2 text-sm">
                        <span className="w-14 text-ink-soft">מועד {moed}</span>
                        <input
                          type="date"
                          name={`date-${c.code}-${moed}`}
                          defaultValue={e?.date ?? ""}
                          className={`${field} min-w-0 flex-1`}
                          aria-label={`תאריך מועד ${moed} ב${c.name}`}
                        />
                        <input
                          type="time"
                          name={`time-${c.code}-${moed}`}
                          defaultValue={e?.start_time ?? ""}
                          className={`${field} w-24`}
                          dir="ltr"
                          aria-label={`שעת מועד ${moed} ב${c.name}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <SaveButton />
          </form>
        </section>

        <section className="panel p-5 sm:p-6" aria-labelledby="cal-title">
          <h2 id="cal-title" className="text-lg font-semibold">
            סנכרון ליומן Google
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            קישור פרטי שמכניס ליומן את ההגשות, הבחינות ומפגשי הלימוד, ומתעדכן לבד.
          </p>
          {feedUrl ? (
            <div className="mt-4 space-y-4">
              <CopyField value={feedUrl} />
              <ol className="list-decimal space-y-1 ps-5 text-sm leading-relaxed">
                <li>העתיקו את הקישור.</li>
                <li>
                  ביומן Google במחשב: <b>הגדרות</b> ← <b>הוספת יומן</b> ← <b>מכתובת URL</b>.
                </li>
                <li>הדביקו ולחצו <b>הוספת יומן</b>. היומן יופיע בשם Unihub גם בטלפון.</li>
              </ol>
              <p className="text-xs text-ink-soft">
                Google מרענן יומנים כאלה פעם בכמה שעות, אז שינוי באפליקציה מגיע ליומן באיחור קטן. מי שמחזיק
                בקישור יכול לראות את התוכנית, אז לא לשתף אותו.
              </p>
              <form action={resetFeed}>
                <button className="text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">
                  יצירת קישור חדש (הקישור הישן יפסיק לעבוד)
                </button>
              </form>
            </div>
          ) : (
            <form action={resetFeed} className="mt-4">
              <SaveButton done="הקישור מוכן">יצירת קישור ליומן</SaveButton>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
