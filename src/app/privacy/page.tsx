import type { Metadata } from "next";
import { CONTACT, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "מדיניות פרטיות · Unihub" };

export default function PrivacyPage() {
  return (
    <LegalPage title="מדיניות פרטיות" updated="16 באוקטובר 2026">
      <p>
        Unihub הוא כלי אישי לתכנון לימודים ושגרה, שפותח על ידי יובל אופק ופתוח בהזמנה לחברים ולמשפחה. הדף הזה מסביר איזה מידע
        נשמר, למה, ומי יכול לראות אותו.
      </p>

      <h2>מה נשמר</h2>
      <ul>
        <li>
          <b>מהתחברות עם Google:</b> שם, כתובת מייל ותמונת פרופיל. Unihub לא מקבל גישה ל־Gmail, ל־Drive או ליומן שלך דרך
          ההתחברות.
        </li>
        <li>
          <b>מה שמזינים באפליקציה:</b> קורסים, התקדמות במטלות וציונים, מועדי בחינות, זמני לימוד, אירועים, שגרות וסימונים,
          והגדרות שיתוף.
        </li>
        <li>
          <b>חיבורים שמפעילים ביוזמתך (לא חובה):</b> סקריפט Google שרץ בחשבון Google שלך ושולח ל־Unihub רק הודעות מכתובות
          openu.ac.il וקובצי PDF מתיקיית Notability ב־Drive; קישור ללוח השנה של אופל; התראות לטלפון. אפשר לנתק כל אחד מהם
          בכל רגע.
        </li>
      </ul>

      <h2>למה</h2>
      <p>
        רק כדי להציג לך את התוכנית, הלוח, ההתראות והמיילים מ־Unihub. המידע לא נמכר, לא משמש לפרסום ולא מועבר לאף אחד מעבר
        למה שכתוב כאן.
      </p>

      <h2>מי רואה מה</h2>
      <ul>
        <li>את/ה רואה את כל המידע שלך.</li>
        <li>
          חברים שאישרת שיעקבו אחריך רואים רק מה שבחרת לשתף (קורסים, התקדמות, ציונים, שעות לימוד, לו״ז, שגרה). אפשר לשנות
          את זה בעמוד ״חברים״ בכל רגע.
        </li>
        <li>מי שהזמנת לאירוע או לשגרה משותפת רואה את האירוע או השגרה האלה.</li>
        <li>מנהל האתר (יובל אופק) יכול לגשת למסד הנתונים לצורך תפעול ותיקון תקלות, ומאשר חשבונות חדשים.</li>
      </ul>

      <h2>איפה זה נשמר</h2>
      <p>
        במסד נתונים של Supabase באירופה (פרנקפורט), והאתר מתארח ב־Vercel. התקשורת מוצפנת (HTTPS), ולכל משתמש יש גישה רק
        לנתונים שלו לפי הרשאות במסד הנתונים.
      </p>

      <h2>בינה מלאכותית</h2>
      <p>
        סיכומי מיילים וכרטיסי תרגול אוטומטיים פועלים רק עבור החשבון של מנהל האתר. המידע של משתמשים אחרים לא נשלח לשירותי
        בינה מלאכותית.
      </p>

      <h2>מחיקה</h2>
      <p>
        אפשר לבקש מחיקה של החשבון וכל המידע בכתובת <a href={`mailto:${CONTACT}`} className="underline" dir="ltr">{CONTACT}</a>,
        והמחיקה תתבצע תוך 30 יום. חיבורים (סקריפט Google, קישור אופל, התראות) מנתקים בעמוד ההגדרות.
      </p>

      <h2>שירותי Google</h2>
      <p>
        השימוש של Unihub במידע שמתקבל מ־Google API עומד ב־
        <a href="https://developers.google.com/terms/api-services-user-data-policy" className="underline">
          Google API Services User Data Policy
        </a>
        , כולל דרישות ה־Limited Use.
      </p>

      <h2>שינויים</h2>
      <p>אם המדיניות תשתנה, התאריך למעלה יתעדכן ושינוי מהותי יוצג באפליקציה.</p>

      <section lang="en" dir="ltr" className="mt-12 space-y-4 border-t border-rule pt-8 text-left">
        <h2>Privacy Policy (English)</h2>
        <p>
          Unihub is a personal study and routine planner made by Yuval Ofek, open by invitation to friends and family.
        </p>
        <ul>
          <li>
            <b>Google sign-in:</b> we receive only your name, email address and profile picture (openid, email, profile). Sign-in
            does not give Unihub access to your Gmail, Drive or Calendar.
          </li>
          <li>
            <b>What you enter:</b> courses, assignment progress and grades, exam dates, availability, events, routines and their
            check-offs, and sharing settings.
          </li>
          <li>
            <b>Optional connections you set up yourself:</b> a Google Apps Script that runs in your own Google account and sends
            Unihub only mail from openu.ac.il addresses and PDFs from your Drive &quot;Notability&quot; folder; an Open University
            Opal calendar link; push notifications. Each can be disconnected at any time.
          </li>
          <li>
            <b>Use:</b> only to show you your plan, calendar, reminders and emails from Unihub. Data is never sold, used for
            advertising, or shared beyond what is described here.
          </li>
          <li>
            <b>Who can see it:</b> you; people you approved as followers see only what you chose to share; people you invite to
            an event or shared routine see that item; the site administrator can access the database for operations.
          </li>
          <li>
            <b>Storage:</b> Supabase (Frankfurt, EU) and Vercel hosting, over HTTPS, with per-user access rules in the database.
          </li>
          <li>
            <b>AI:</b> automatic mail summaries and practice cards run only for the administrator&apos;s own account; other
            users&apos; data is not sent to AI services.
          </li>
          <li>
            <b>Deletion:</b> email{" "}
            <a href={`mailto:${CONTACT}`} className="underline">
              {CONTACT}
            </a>{" "}
            and your account and data will be deleted within 30 days.
          </li>
          <li>
            Unihub&apos;s use of information received from Google APIs adheres to the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" className="underline">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </li>
        </ul>
      </section>
    </LegalPage>
  );
}
