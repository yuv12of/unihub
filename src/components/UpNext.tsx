import { range } from "@/lib/time";
import Link from "next/link";
import { SessionToggle } from "@/components/SessionToggle";
import { ExamKit } from "@/components/ExamKit";
import { minutesLabel, sessionKey, type Session } from "@/lib/planner";
import { Icon } from "@/components/Icon";
import { ReadChips } from "@/components/ReadChips";
import { MathText } from "@/components/MathText";
import type { ReadingItem } from "@/lib/readings";

export interface UpNextItem {
  title: string;
  start: string;
  end: string | null;
  color: string;
  session?: Session;
  place?: string | null;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** The top of Today: what's now or next, a start button, the nearest deadline and exam. */
export function UpNext({
  nowMin,
  item,
  status,
  tomorrow,
  deadline,
  exam,
  reading,
  prep,
  unmarked = 0,
}: {
  /** earlier sessions today that nobody marked done or skipped */
  unmarked?: number;
  nowMin: number;
  item: UpNextItem | null;
  status?: "done" | "skipped";
  tomorrow?: Session;
  deadline: { label: string; when: string; urgent: boolean } | null;
  exam: { course: string; days: number; time: string | null } | null;
  reading?: { href: string; title: string; lastPage: number | null } | null;
  /** before a tutorial: that week's chapters */
  prep?: ReadingItem | null;
}) {
  const live = item && toMin(item.start) <= nowMin;
  const inMin = item ? toMin(item.start) - nowMin : 0;
  return (
    <section aria-label="הבא בתור" className="accent-surface overflow-hidden rounded-2xl shadow-sm ring-1 ring-on-accent/10">
      <div className="p-5">
        {item ? (
          <>
            <p className="text-sm opacity-75">
              {live ? `עכשיו${item.end ? `, עד ${range(item.end)}` : ""}` : inMin < 60 ? `בעוד ${inMin} דק׳ (${range(item.start, item.end)})` : range(item.start, item.end)}
            </p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold leading-snug">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: item.color }} aria-hidden />
              {item.title}
            </h2>
            {item.place && <p className="mt-0.5 text-sm opacity-75">{item.place}</p>}
            {item.session && (
              <div className="mt-4">
                <SessionToggle hero sessionKey={sessionKey(item.session)} status={status} minutes={item.session.minutes} title={item.session.title} courseCode={item.session.courseCode} />
              </div>
            )}
            {prep && prep.links.length > 0 && (
              <div className="mt-3 text-sm">
                <p className="opacity-75">לקראת המפגש: <MathText text={prep.label} /></p>
                <ReadChips links={prep.links} className="mt-1.5 [&_a]:border-on-accent/30 [&_a]:text-on-accent [&_span]:text-on-accent/80" />
              </div>
            )}
            {reading && (
              <Link href={reading.href} className="mt-3 flex items-center gap-2 text-sm opacity-90 hover:opacity-100">
                <Icon name="book" className="size-4 shrink-0" />
                <span className="min-w-0 truncate underline decoration-on-accent/40 underline-offset-4">
                  לקרוא: {reading.title}
                  {reading.lastPage ? `, מעמ׳ ${reading.lastPage}` : ""}
                </span>
              </Link>
            )}
          </>
        ) : (
          <>
            <p className="text-sm opacity-75">להיום</p>
            {/* never "nothing planned" while an earlier session still waits to be marked */}
            <h2 className="mt-1 text-xl font-semibold">
              {unmarked > 0 ? (unmarked === 1 ? "נשאר לסמן מפגש אחד מקודם" : `נשארו לסמן ${unmarked} מפגשים מקודם`) : "אין עוד משהו מתוכנן היום"}
            </h2>
            {unmarked > 0 && <p className="mt-1 text-sm opacity-75">בוצע או דולג? הסימון מעדכן את התוכנית לימים הבאים.</p>}
            {tomorrow && (
              <p className="mt-1 text-sm opacity-75">
                מחר ב־{tomorrow.start}: {tomorrow.title} ({minutesLabel(tomorrow.minutes)})
              </p>
            )}
          </>
        )}
      </div>
      {(deadline || exam) && (
        <div className="space-y-1 border-t border-on-accent/15 bg-on-accent/5 px-5 py-3 text-sm">
          {exam && (
            <p className="flex items-baseline gap-2">
              <Icon name="pencil" className="size-4 self-center opacity-75" />
              <span>{exam.days === 0 ? "היום" : exam.days === 1 ? "מחר" : `בעוד ${exam.days} ימים`}: בחינה ב{exam.course}
              {exam.time ? ` ב־${exam.time}` : ""}
              {exam.days > 1 && <span className="opacity-75"> · תקופת מבחנים, התוכנית מתמקדת בקורס הזה</span>}
              </span>
            </p>
          )}
          {deadline && (
            <p className="flex items-baseline gap-2">
              <Icon name="pin" className="size-4 self-center opacity-75" />
              <span>
                ההגשה הבאה: {deadline.label},{" "}
                <span className={deadline.urgent ? "font-semibold underline decoration-2 underline-offset-4" : ""}>{deadline.when}</span>
              </span>
            </p>
          )}
        </div>
      )}
      {exam && exam.days <= 1 && <ExamKit day={exam.days} />}
    </section>
  );
}
