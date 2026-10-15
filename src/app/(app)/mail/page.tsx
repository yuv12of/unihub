import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { MailBox } from "@/components/MailBox";
import { getIngestToken, getMails } from "@/lib/userdata";
import { supabaseEnabled } from "@/lib/supabase/config";

export default function MailPage() {
  return (
    <>
      <h1 className="font-display text-4xl">דואר מהאוניברסיטה</h1>
      <p className="mt-2 text-ink-soft">כל ההודעות מהאוניברסיטה הפתוחה במקום אחד, עם סיכום קצר לכל אחת.</p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Inbox />
      </Suspense>
    </>
  );
}

async function Inbox() {
  await connection();
  const [mails, token] = await Promise.all([getMails(), getIngestToken()]);
  if (mails.length === 0)
    return (
      <div className="panel mt-8 max-w-xl p-6">
        <h2 className="font-semibold">{token ? "מחכים להודעות הראשונות" : "עוד לא מחובר"}</h2>
        <p className="mt-2 leading-relaxed text-ink-soft">
          {token
            ? "הסקריפט ב־Gmail שולח הודעות חדשות כל 10 דקות. אם הגדרתם אותו עכשיו, ההודעות יופיעו כאן תוך כמה דקות."
            : "כדי שההודעות יגיעו לכאן, מחברים פעם אחת סקריפט קטן בחשבון Google שלכם. זה לוקח כחמש דקות."}
        </p>
        <Link href="/settings#mail" className="mt-4 inline-block rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg">
          {token ? "להוראות החיבור" : "לחיבור הדואר"}
        </Link>
      </div>
    );
  return (
    <div className="mt-8">
      <MailBox mails={mails} editable={supabaseEnabled} />
    </div>
  );
}
