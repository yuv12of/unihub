import { Icon } from "@/components/Icon";
import { StuckList } from "@/components/StuckList";
import { getStuck } from "@/lib/userdata";
import { getNextPhoneSlot, getNextTutorial, getStuckQuestions } from "@/lib/practiceData";
import { telHref } from "@/lib/practice";
import { range } from "@/lib/time";
import type { AskContext } from "@/app/practiceActions";

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: "UTC", weekday: "long", day: "numeric", month: "numeric" }).format(new Date(iso + "T00:00:00Z"));

/**
 * "Questions for the tutor" for one course: the open stuck points (each can become a forum post,
 * a mail draft or a phone question), with the next phone-tutoring hour and the next meetup.
 * Server component, loads its own data: place it inside a <Suspense> on the course page.
 */
export async function QuestionsForTutor({ courseCode, courseName, forumHref }: { courseCode: string; courseName?: string; forumHref?: string | null }) {
  const [stuck, phone, tutorial] = await Promise.all([getStuck(), getNextPhoneSlot(courseCode), getNextTutorial(courseCode)]);
  const open = stuck.filter((s) => s.course_code === courseCode && !s.resolved);
  const drafts = await getStuckQuestions(open.map((s) => s.id));
  const contexts: Record<string, AskContext> = Object.fromEntries(
    open.map((s) => [s.id, { courseName: courseName ?? null, forumHref: forumHref ?? null, question: drafts[s.id] ?? null, phone, tutorial }]),
  );
  return (
    <section className="panel p-5">
      <h2 className="section-title">שאלות למנחה {open.length > 0 && <span className="text-base text-ink-soft">({open.length})</span>}</h2>
      {phone ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Icon name="call" className="size-4 text-ink-soft" />
          הנחיה טלפונית: {dayLabel(phone.date)} {range(phone.start_time, phone.end_time)}
          {phone.tutor ? ` · ${phone.tutor}` : ""}
          {phone.phone && (
            <a href={telHref(phone.phone)} className="underline decoration-rule underline-offset-4">
              <bdi dir="ltr">{phone.phone}</bdi>
            </a>
          )}
        </p>
      ) : null}
      {tutorial && (
        <p className="mt-1 flex items-center gap-2 text-sm">
          <Icon name="users" className="size-4 text-ink-soft" />
          מפגש הבא: {dayLabel(tutorial.date)} {range(tutorial.start_time, tutorial.end_time)}
        </p>
      )}
      {open.length ? (
        <div className="mt-3">
          <StuckList items={open} bare contexts={contexts} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">אין כרגע שאלות פתוחות. כשמסמנים &quot;נתקעתי&quot; בטיימר או בשאלה מהספר, היא תופיע כאן.</p>
      )}
    </section>
  );
}
