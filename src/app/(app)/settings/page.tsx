import { Suspense } from "react";
import { connection } from "next/server";
import { headers } from "next/headers";
import { resetFeed, resetIngestToken, saveExams, saveJewish, savePrefs } from "@/app/actions";
import { Tabs } from "@/components/Fold";
import { ActionForm } from "@/components/ActionForm";
import { GoogleCalImport } from "@/components/GoogleCalImport";
import { CITIES, jewishPrefs } from "@/lib/hebcal";
import { mailScript } from "@/lib/appsScript";
import { CopyField, SaveButton } from "@/components/FormBits";
import { PushSetup } from "@/components/PushSetup";
import { getCourses, getExams, getFeedToken, getGoogleFeed, getIngestToken, getMyProfile, getOpalFeed, getPrefs } from "@/lib/userdata";
import { LookPicker, WeeklyGoal } from "@/components/ProfileParts";
import { SpotifyCard } from "@/components/SpotifyCard";
import { CourseChip } from "@/components/CourseChip";
import { Chevron } from "@/components/Icon";
import { OpalSync } from "@/components/OpalSync";
import { supabaseEnabled } from "@/lib/supabase/config";
import { semester, themeOf } from "@/lib/semester";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
/** "08:45" + 405 min → "15:30" (a window never runs past midnight). */
const endOf = (start: string, minutes: number) => {
  const [h, m] = start.split(":").map(Number);
  const e = Math.min(h * 60 + m + minutes, 24 * 60 - 1);
  return `${String(Math.floor(e / 60)).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`;
};
const SESSION = [45, 60, 90, 120];

export default function SettingsPage() {
  return (
    <>
      <h1 className="font-display text-4xl">הגדרות</h1>
      <p className="mt-2 text-ink-soft">זמני לימוד, בחינות, יומנים, התראות, מראה ומוזיקה.</p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Settings />
      </Suspense>
    </>
  );
}

const field = "rounded-lg border border-rule-strong bg-surface px-3 py-2";

async function Settings() {
  await connection();
  // Local design previews (UNIHUB_DEMO, no database) show the forms with their defaults.
  if (!supabaseEnabled && !process.env.UNIHUB_DEMO) return <p className="mt-8">ההגדרות זמינות אחרי התחברות.</p>;
  const [prefs, exams, token, ingest, opal, courses, google, me] = await Promise.all([
    getPrefs(),
    getExams(),
    getFeedToken(),
    getIngestToken(),
    getOpalFeed(),
    getCourses(),
    getGoogleFeed(),
    getMyProfile(),
  ]);
  const name = me?.name ?? me?.email.split("@")[0] ?? "";
  const profileInput = {
    name,
    bio: me?.bio ?? "",
    program: me?.program ?? "",
    study_year: me?.study_year ?? "",
    avatar_emoji: me?.avatar_emoji ?? "",
    avatar_color: me?.avatar_color ?? "",
    weekly_goal_minutes: me?.weekly_goal_minutes ?? null,
  };
  const jp = jewishPrefs(prefs.jewish);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const feedUrl = token ? `${origin}/api/calendar/${token}` : null;
  const examOf = (code: string, moed: string) => exams.find((e) => e.course_code === code && e.moed === moed);

  return (
    <div className="mt-6">
      <Tabs
        id="settings"
        anchors={{
          opal: "calendars",
          google: "calendars",
          jewish: "calendars",
          mail: "connect",
          spotify: "music",
        }}
        tabs={[
          {
            key: "study",
            label: "זמני לימוד",
            panel: (
              <div className="grid items-start gap-6 xl:grid-cols-2">
                <section className="panel p-5 sm:p-6" aria-labelledby="avail-title">
                  <h2 id="avail-title" className="section-title">
                    זמני לימוד
                  </h2>
                  <p className="mt-1 text-sm text-ink-soft">התוכנית משבצת מפגשי לימוד רק בזמנים האלה.</p>
                  <div className="mt-4">
                    <WeeklyGoal initial={profileInput} />
                    <p className="mt-1 text-xs text-ink-soft">התוכנית ממלאת זמן פנוי עד היעד, ולוח השנה מראה כמה חסר.</p>
                  </div>
                  <ActionForm action={savePrefs} className="mt-5 space-y-5">
                    <div className="divide-y divide-rule border-y border-rule">
                      {DAYS.map((name, d) => {
                        const slot = prefs.availability[String(d)] ?? {
                          start: "18:00",
                          minutes: 0,
                        };
                        return (
                          <div key={d} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                            <label className="flex min-h-11 w-24 items-center gap-2 font-medium">
                              <input type="checkbox" name={`on-${d}`} defaultChecked={slot.minutes > 0} className="size-5" />
                              {name}
                            </label>
                            <label className="flex items-center gap-2 text-sm text-ink-soft">
                              מ־
                              <input type="time" name={`start-${d}`} defaultValue={slot.start} className={field} dir="ltr" />
                            </label>
                            <label className="flex items-center gap-2 text-sm text-ink-soft">
                              עד
                              <input type="time" name={`end-${d}`} defaultValue={endOf(slot.start, slot.minutes > 0 ? slot.minutes : 120)} className={field} dir="ltr" />
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
                        <span className="block text-sm text-ink-soft">בימים בלי הכנה למטלה או לבחינה, התוכנית מסבבת בין הקורסים.</span>
                      </span>
                    </label>
                    <SaveButton />
                  </ActionForm>
                </section>
                <section className="panel p-5 sm:p-6" aria-labelledby="exam-title">
                  <h2 id="exam-title" className="section-title">
                    מועדי בחינה
                  </h2>
                  <p className="mt-1 text-sm text-ink-soft">
                    המועדים לסמסטר {semester.semester} עוד לא פורסמו. כשיופיעו בשאילתא, הזינו אותם כאן והתוכנית תתחיל חזרות שלושה שבועות לפני כל
                    בחינה.
                  </p>
                  <ActionForm action={saveExams} className="mt-5 space-y-5">
                    {courses.map((c) => (
                      <fieldset key={c.code}>
                        <legend className="font-medium">
                          <CourseChip short={c.name} color={themeOf(courses, c.code).color} />
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
                  </ActionForm>
                </section>
              </div>
            ),
          },
          {
            key: "calendars",
            label: "יומנים וחגים",
            panel: (
              <div className="grid items-start gap-6 xl:grid-cols-2">
                <section className="panel p-5 sm:p-6" aria-labelledby="cal-title">
                  <h2 id="cal-title" className="section-title">
                    יומן Google, בשני הכיוונים
                  </h2>
                  <h3 className="mt-4 font-medium">מ־Unihub ל־Google</h3>
                  <p className="mt-1 text-sm text-ink-soft">קישור פרטי שמכניס ליומן את ההגשות, הבחינות ומפגשי הלימוד, ומתעדכן לבד.</p>
                  {feedUrl ? (
                    <div className="mt-4 space-y-4">
                      <CopyField value={feedUrl} />
                      <ol className="list-decimal space-y-1 ps-5 text-sm leading-relaxed">
                        <li>העתיקו את הקישור.</li>
                        <li>
                          ביומן Google במחשב: <b>הגדרות</b> ← <b>הוספת יומן</b> ← <b>מכתובת URL</b>.
                        </li>
                        <li>
                          הדביקו ולחצו <b>הוספת יומן</b>. היומן יופיע בשם Unihub גם בטלפון.
                        </li>
                      </ol>
                      <p className="text-xs text-ink-soft">
                        Google מרענן יומנים כאלה פעם בכמה שעות, אז שינוי באפליקציה מגיע ליומן באיחור קטן. מי שמחזיק בקישור יכול לראות את התוכנית, אז
                        לא לשתף אותו.
                      </p>
                      <ActionForm action={resetFeed}>
                        <button className="text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">
                          יצירת קישור חדש (הקישור הישן יפסיק לעבוד)
                        </button>
                      </ActionForm>
                    </div>
                  ) : (
                    <ActionForm action={resetFeed} className="mt-4">
                      <SaveButton done="הקישור מוכן">יצירת קישור ליומן</SaveButton>
                    </ActionForm>
                  )}
                  <h3 id="google" className="mt-6 scroll-mt-24 border-t border-rule pt-5 font-medium">
                    מ־Google ל־Unihub
                  </h3>
                  <p className="mt-1 text-sm text-ink-soft">
                    אירועים מהיומן שלכם (עבודה, תורים, משפחה) נכנסים ללוח ולתוכנית, והתוכנית לא משבצת לימוד עליהם. אירועים של יום שלם ואירועים
                    שמסומנים &quot;פנוי&quot; רק מוצגים.
                  </p>
                  <GoogleCalImport feed={google} />
                </section>
                <div className="space-y-6">
                  <section id="opal" className="panel scroll-mt-24 p-5 sm:p-6" aria-labelledby="opal-title">
                    <h2 id="opal-title" className="section-title">
                      לוח השנה של אופל
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-ink-soft">
                      מפגשים, מטלות ואירועים שהמרצים מפרסמים באתרי הקורסים נכנסים ל־Unihub לבד, כל שעה. הקישור של אופל מאפשר רק לקרוא את לוח השנה, בלי
                      סיסמה, ואפשר לבטל אותו באופל בכל רגע.
                    </p>
                    <OpalSync feed={opal} />
                  </section>
                  <section id="jewish" className="panel scroll-mt-24 p-5 sm:p-6" aria-labelledby="jewish-title">
                    <h2 id="jewish-title" className="section-title">
                      חגים ושבת
                    </h2>
                    <p className="mt-1 text-sm text-ink-soft">חגים וראשי חודשים, ולמי שרוצה גם זמני כניסת ויציאת שבת, לפי Hebcal.</p>
                    <ActionForm action={saveJewish} className="mt-4 space-y-4">
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
                    </ActionForm>
                  </section>
                </div>
              </div>
            ),
          },
          {
            key: "notify",
            label: "התראות",
            panel: (
              <div className="max-w-3xl">
                <section className="panel p-5 sm:p-6" aria-labelledby="push-title">
                  <h2 id="push-title" className="section-title">
                    התראות לטלפון
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-ink-soft">
                    תזכורת כרבע שעה לפני מפגש לימוד, מפגש הנחיה או שגרה, ב־20:00 על הגשה של מחר, וב־22:00 סיכום של מה שעוד לא סומן. וגם: בקשות מעקב,
                    הזמנות ופרגונים מחברים.
                  </p>
                  <PushSetup />
                </section>
              </div>
            ),
          },
          {
            key: "connect",
            label: "חיבור ל־Google",
            panel: (
              <div className="max-w-4xl">
                <section id="mail" className="panel scroll-mt-24 p-5 sm:p-6" aria-labelledby="mail-title">
                  <h2 id="mail-title" className="section-title">
                    חיבור ל־Google: דואר, מייל בוקר, תזכורות ו־Notability
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-ink-soft">
                    סקריפט אחד בחשבון Google שלך: שולח ל־Unihub רק הודעות מ־openu.ac.il (כל 10 דקות, עם הטקסט של קובצי ה־PDF המצורפים), מפעיל תזכורות
                    לטלפון, מרענן את לוח השנה של אופל, שולח לך כל בוקר ב־07:00 מייל עם התוכנית ובימי שישי סיכום שבועי, ומעביר סיכומים חדשים מתיקיית
                    Notability ב־Drive.
                  </p>
                  {ingest ? (
                    <div className="mt-4 space-y-4">
                      <ol className="list-decimal space-y-1.5 ps-5 text-sm leading-relaxed">
                        <li>
                          פתחו את <b dir="ltr">script.google.com</b> (מחובר לחשבון ה־Gmail שלכם) ← <b>פרויקט חדש</b>.
                        </li>
                        <li>מחקו את מה שכתוב שם והדביקו את הקוד שלמטה. שמרו (Ctrl+S) ותנו לפרויקט שם, למשל Unihub.</li>
                        <li>
                          בחרו בפונקציה <b dir="ltr">setup</b> מהרשימה למעלה ולחצו <b>הפעלה</b>. Google יבקש אישור גישה ל־Gmail. בשלב &quot;האפליקציה
                          לא אומתה&quot; לחצו <b>מתקדם</b> ← <b>מעבר ל־Unihub</b>. זה בטוח: הקוד רץ רק אצלכם.
                        </li>
                        <li>
                          לזיהוי טקסט בסיכומים: בעורך, ליד <b>Services</b> לחצו <b>+</b>, בחרו <b dir="ltr">Drive API</b> ולחצו <b>Add</b>. אחר כך
                          הריצו שוב את <b dir="ltr">setup</b>.
                        </li>
                        <li>
                          ב־Notability: <b>הגדרות</b> ← <b>גיבוי אוטומטי</b> ← <b>Google Drive</b>, פורמט <b>PDF</b>. כדאי שהנושאים ב־Notability
                          ייקראו כמו הקורסים (אינפי, לינארית, מבני נתונים) כדי שכל סיכום ישויך לקורס הנכון.
                        </li>
                      </ol>
                      <p className="text-sm">
                        <span className="hl">גרסה חדשה (אוקטובר 2026):</span> כבר הדבקתם גרסה קודמת? החליפו את כל הקוד בגרסה הזו, הריצו{" "}
                        <b dir="ltr">setup</b>, ואחר כך פעם אחת <b dir="ltr">backfillAttachmentText</b> (קורא את מסמכי ה־PDF של ארבעת החודשים
                        האחרונים; אם נעצר באמצע, מריצים שוב). שום דבר לא ייכפל.
                      </p>
                      <details className="group">
                        <summary className="summary-clean flex min-h-10 items-center gap-2 text-sm font-medium">
                          הקוד להדבקה
                          <Chevron />
                        </summary>
                        <div className="mt-2">
                          <CopyField value={mailScript(origin, ingest)} multiline />
                        </div>
                      </details>
                      <ActionForm action={resetIngestToken}>
                        <button className="text-sm text-ink-soft underline underline-offset-4 decoration-rule hover:text-ink">
                          יצירת מפתח חדש (הסקריפט הקיים יפסיק לעבוד עד שתדביקו קוד חדש)
                        </button>
                      </ActionForm>
                    </div>
                  ) : (
                    <ActionForm action={resetIngestToken} className="mt-4">
                      <SaveButton done="מוכן">התחלת חיבור הדואר</SaveButton>
                    </ActionForm>
                  )}
                </section>
              </div>
            ),
          },
          {
            key: "look",
            label: "מראה",
            panel: (
              <section className="panel max-w-4xl p-5 sm:p-6" aria-labelledby="look-title">
                <h2 id="look-title" className="section-title">
                  מראה
                </h2>
                <p className="mt-1 mb-5 text-sm text-ink-soft">צבעים, סגנון, בהיר או כהה, גודל טקסט, מה מופיע ב״היום״ ואילו לשוניות בסרגל בטלפון. נשמר בחשבון, אז עובר בין המכשירים.</p>
                <LookPicker initial={me?.prefs ?? {}} />
              </section>
            ),
          },
          {
            key: "music",
            label: "מוזיקה",
            panel: (
              <section id="spotify" className="panel max-w-4xl scroll-mt-24 p-5 sm:p-6" aria-labelledby="music-title">
                <h2 id="music-title" className="section-title">
                  מוזיקה לריכוז
                </h2>
                <div className="mt-4">
                  <LookPicker initial={me?.prefs ?? {}} part="music" />
                </div>
                <SpotifyCard />
              </section>
            ),
          },
        ]}
      />
    </div>
  );
}
