import { Suspense } from "react";
import { connection } from "next/server";
import { headers } from "next/headers";
import { resetFeed, resetIngestToken, saveExams, saveJewish, savePrefs } from "@/app/actions";
import { GoogleCalImport } from "@/components/GoogleCalImport";
import { CITIES, jewishPrefs } from "@/lib/hebcal";
import { mailScript } from "@/lib/appsScript";
import { CopyField, SaveButton } from "@/components/FormBits";
import { PushSetup } from "@/components/PushSetup";
import { getCourses, getExams, getFeedToken, getGoogleFeed, getIngestToken, getOpalFeed, getPrefs } from "@/lib/userdata";
import { OpalSync } from "@/components/OpalSync";
import { supabaseEnabled } from "@/lib/supabase/config";
import { semester, themeOf } from "@/lib/semester";

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
  const [prefs, exams, token, ingest, opal, courses, google] = await Promise.all([getPrefs(), getExams(), getFeedToken(), getIngestToken(), getOpalFeed(), getCourses(), getGoogleFeed()]);
  const jp = jewishPrefs(prefs.jewish);
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
            {courses.map((c) => (
              <fieldset key={c.code}>
                <legend className="flex items-center gap-2 font-medium">
                  <span className="size-2.5 rounded-full" style={{ background: themeOf(courses, c.code).color }} />
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
            יומן Google, בשני הכיוונים
          </h2>
          <h3 className="mt-4 font-medium">מ־Unihub ל־Google</h3>
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
          <h3 id="google" className="mt-6 scroll-mt-24 border-t border-rule pt-5 font-medium">מ־Google ל־Unihub</h3>
          <p className="mt-1 text-sm text-ink-soft">
            אירועים מהיומן שלכם (עבודה, תורים, משפחה) נכנסים ללוח ולתוכנית, והתוכנית לא משבצת לימוד עליהם. אירועים של יום שלם
            ואירועים שמסומנים &quot;פנוי&quot; רק מוצגים.
          </p>
          <GoogleCalImport feed={google} />
        </section>

        <section id="jewish" className="panel scroll-mt-24 p-5 sm:p-6" aria-labelledby="jewish-title">
          <h2 id="jewish-title" className="text-lg font-semibold">
            חגים ושבת
          </h2>
          <p className="mt-1 text-sm text-ink-soft">חגים וראשי חודשים, ולמי שרוצה גם זמני כניסת ויציאת שבת, לפי Hebcal.</p>
          <form action={saveJewish} className="mt-4 space-y-4">
            <label className="flex items-start gap-3">
              <input type="checkbox" name="show" defaultChecked={jp.show} className="mt-1 size-4" />
              <span>להציג חגים וראשי חודשים בלוח ובמסך היום</span>
            </label>
            <label className="flex items-start gap-3">
              <input type="checkbox" name="times" defaultChecked={jp.times} className="mt-1 size-4" />
              <span>
                להציג גם זמני שבת
                <span className="block text-sm text-ink-soft">הדלקת נרות, הבדלה ופרשת השבוע.</span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input type="checkbox" name="rest" defaultChecked={jp.rest} className="mt-1 size-4" />
              <span>
                מצב שבת
                <span className="block text-sm text-ink-soft">
                  בשבת ובחג אין מפגשי לימוד, אין תזכורות והרצפים נשמרים. בערב שבת וחג לא משובץ לימוד מחצי שעה לפני הדלקת נרות.
                </span>
              </span>
            </label>
            <label className="flex items-center gap-3">
              עיר לזמני השבת
              <select name="city" defaultValue={jp.city} className={field}>
                {CITIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <SaveButton />
          </form>
        </section>
      </div>

      <section id="opal" className="panel scroll-mt-24 p-5 sm:p-6 xl:col-span-2" aria-labelledby="opal-title">
        <h2 id="opal-title" className="text-lg font-semibold">
          לוח השנה של אופל
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          מפגשים, מטלות ואירועים שהמרצים מפרסמים באתרי הקורסים נכנסים ל־Unihub לבד, כל שעה. הקישור של אופל מאפשר רק לקרוא את
          לוח השנה, בלי סיסמה, ואפשר לבטל אותו באופל בכל רגע.
        </p>
        <OpalSync feed={opal} />
      </section>

      <section className="panel p-5 sm:p-6 xl:col-span-2" aria-labelledby="push-title">
        <h2 id="push-title" className="text-lg font-semibold">
          התראות לטלפון
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          תזכורת כרבע שעה לפני מפגש לימוד, מפגש הנחיה או שגרה, ב־20:00 על הגשה של מחר, וב־22:00 סיכום של מה שעוד לא
          סומן. וגם: בקשות מעקב, הזמנות ופרגונים מחברים.
        </p>
        <PushSetup />
      </section>

      <section id="mail" className="panel scroll-mt-24 p-5 sm:p-6 xl:col-span-2" aria-labelledby="mail-title">
        <h2 id="mail-title" className="text-lg font-semibold">
          חיבור ל־Google: דואר, מייל בוקר, תזכורות ו־Notability
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          סקריפט אחד בחשבון Google שלך: שולח ל־Unihub רק הודעות מ־openu.ac.il (כל 10 דקות, עם הטקסט של קובצי ה־PDF
          המצורפים), מפעיל תזכורות לטלפון, מרענן את לוח השנה של אופל, שולח לך כל בוקר ב־07:00 מייל עם התוכנית ובימי שישי
          סיכום שבועי, ומעביר סיכומים חדשים מתיקיית Notability ב־Drive.
        </p>
        {ingest ? (
          <div className="mt-4 space-y-4">
            <ol className="list-decimal space-y-1.5 ps-5 text-sm leading-relaxed">
              <li>
                פתחו את <b dir="ltr">script.google.com</b> (מחובר לחשבון ה־Gmail שלכם) ← <b>פרויקט חדש</b>.
              </li>
              <li>מחקו את מה שכתוב שם והדביקו את הקוד שלמטה. שמרו (Ctrl+S) ותנו לפרויקט שם, למשל Unihub.</li>
              <li>
                בחרו בפונקציה <b dir="ltr">setup</b> מהרשימה למעלה ולחצו <b>הפעלה</b>. Google יבקש אישור גישה ל־Gmail. בשלב
                &quot;האפליקציה לא אומתה&quot; לחצו <b>מתקדם</b> ← <b>מעבר ל־Unihub</b>. זה בטוח: הקוד רץ רק אצלכם.
              </li>
              <li>
                לזיהוי טקסט בסיכומים: בעורך, ליד <b>Services</b> לחצו <b>+</b>, בחרו <b dir="ltr">Drive API</b> ולחצו <b>Add</b>. אחר כך
                הריצו שוב את <b dir="ltr">setup</b>.
              </li>
              <li>
                ב־Notability: <b>הגדרות</b> ← <b>גיבוי אוטומטי</b> ← <b>Google Drive</b>, פורמט <b>PDF</b>. כדאי שהנושאים
                ב־Notability ייקראו כמו הקורסים (אינפי, לינארית, מבני נתונים) כדי שכל סיכום ישויך לקורס הנכון.
              </li>
            </ol>
            <p className="text-sm">
              <span className="hl">גרסה חדשה (אוקטובר 2026):</span> כבר הדבקתם גרסה קודמת? החליפו את כל הקוד בגרסה הזו, הריצו{" "}
              <b dir="ltr">setup</b>, ואחר כך פעם אחת <b dir="ltr">backfillAttachmentText</b> (קורא את מסמכי ה־PDF של ארבעת
              החודשים האחרונים; אם נעצר באמצע, מריצים שוב). שום דבר לא ייכפל.
            </p>
            <details>
              <summary className="cursor-pointer text-sm font-medium">הקוד להדבקה</summary>
              <div className="mt-2">
                <CopyField value={mailScript(origin, ingest)} multiline />
              </div>
            </details>
            <form action={resetIngestToken}>
              <button className="text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">
                יצירת מפתח חדש (הסקריפט הקיים יפסיק לעבוד עד שתדביקו קוד חדש)
              </button>
            </form>
          </div>
        ) : (
          <form action={resetIngestToken} className="mt-4">
            <SaveButton done="מוכן">התחלת חיבור הדואר</SaveButton>
          </form>
        )}
      </section>
    </div>
  );
}
