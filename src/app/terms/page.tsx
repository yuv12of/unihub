import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "תנאי שימוש · Unihub" };

export default function TermsPage() {
  return (
    <LegalPage title="תנאי שימוש" updated="16 באוקטובר 2026">
      <p>Unihub הוא פרויקט אישי ללא מטרות רווח, פתוח בהזמנה לחברים ולמשפחה. השימוש בו כפוף לתנאים האלה.</p>

      <h2>גישה</h2>
      <ul>
        <li>כל חשבון חדש צריך אישור של מנהל האתר. אפשר להסיר או לחסום חשבון בכל עת.</li>
        <li>השימוש הוא אישי. לא לשתף את הכניסה שלך, ולא לנסות לגשת למידע של אחרים מעבר למה שהם שיתפו.</li>
        <li>השירות חינמי, ויכול להשתנות או להיסגר בלי הודעה מוקדמת.</li>
      </ul>

      <h2>אחריות על המידע</h2>
      <ul>
        <li>
          Unihub אינו קשור לאוניברסיטה הפתוחה ואינו מייצג אותה. מועדי הגשה, בחינות ודרישות קורס נלקחים ממקורות ציבוריים או
          ממה שהוזן, ועלולים להיות שגויים או לא מעודכנים. <b>המקור המחייב הוא תמיד האוניברסיטה</b> (שאילתא ואתרי הקורסים).
        </li>
        <li>התוכנית, ההתראות והחישובים (למשל מחשבון הציון) הם עזר בלבד. השירות ניתן &quot;כמות שהוא&quot;, בלי אחריות לזמינות או לדיוק.</li>
      </ul>

      <h2>תוכן ושיתוף</h2>
      <ul>
        <li>מה שאת/ה מזין/ה שייך לך. את/ה אחראי/ת למה שמשתפים עם אחרים (אירועים, שגרות, הגדרות שיתוף).</li>
        <li>לא להשתמש ב־Unihub להטרדה, לשליחת תוכן פוגעני או לכל שימוש בלתי חוקי.</li>
      </ul>

      <h2>פרטיות</h2>
      <p>
        המידע נשמר ומשמש כמתואר ב
        <Link href="/privacy" className="underline">
          מדיניות הפרטיות
        </Link>
        .
      </p>

      <h2>יצירת קשר</h2>
      <p>
        שאלות, בקשות ומחיקת חשבון:{" "}
        <a href={`mailto:${CONTACT}`} className="underline" dir="ltr">
          {CONTACT}
        </a>
      </p>

      <section lang="en" dir="ltr" className="mt-12 space-y-4 border-t border-rule pt-8 text-left">
        <h2>Terms of Service (English)</h2>
        <ul>
          <li>Unihub is a free, non-commercial personal project, available by invitation. New accounts need the administrator&apos;s approval and may be removed at any time.</li>
          <li>Use it for yourself only; do not share your login or try to access other people&apos;s data beyond what they share with you.</li>
          <li>
            Unihub is not affiliated with the Open University of Israel. Deadlines, exam dates and course requirements may be wrong or
            out of date; the university&apos;s own systems are always the authoritative source.
          </li>
          <li>The service, its plans, reminders and calculations are provided &quot;as is&quot;, without warranty of availability or accuracy.</li>
          <li>Your content stays yours. You are responsible for what you share with others. No harassment, abusive content or unlawful use.</li>
          <li>
            Data handling is described in the <Link href="/privacy" className="underline">Privacy Policy</Link>. Contact:{" "}
            <a href={`mailto:${CONTACT}`} className="underline">
              {CONTACT}
            </a>
            .
          </li>
        </ul>
      </section>
    </LegalPage>
  );
}
