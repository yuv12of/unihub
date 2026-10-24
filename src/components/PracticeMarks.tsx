import { getPracticeMarks, type PracticeMark } from "@/lib/practiceMarks";
import { getCourses } from "@/lib/userdata";
import { themeOf } from "@/lib/semester";
import { supabaseEnabled } from "@/lib/supabase/config";
import { PracticeMarkItem } from "@/components/PracticeMarkItem";

async function List({ marks, title }: { marks: PracticeMark[]; title: string }) {
  if (!marks.length) return null;
  const courses = await getCourses();
  return (
    <div>
      <h2 className="section-title mb-3">{title}</h2>
      <ul className="panel divide-y divide-rule overflow-hidden">
        {marks.map((m) => (
          <PracticeMarkItem
            key={m.id}
            m={m}
            course={m.course_code ? themeOf(courses, m.course_code).short : (m.note?.name ?? "תרגול")}
            color={m.course_code ? themeOf(courses, m.course_code).color : "var(--ink-soft)"}
            editable={supabaseEnabled}
          />
        ))}
      </ul>
    </div>
  );
}

/** Today: overnight feedback not seen yet (renders nothing when there is none). */
export async function PracticeMarksCard() {
  return <List marks={await getPracticeMarks({ unseenOnly: true, limit: 3 })} title="משוב על התרגול שלך" />;
}

/** /study: recent feedback on handwritten practice. */
export async function PracticeMarks() {
  return <List marks={await getPracticeMarks({ limit: 20 })} title="משוב על תרגול בכתב יד" />;
}
