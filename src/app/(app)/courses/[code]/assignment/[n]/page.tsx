import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCourses } from "@/lib/userdata";
import { getChecks, getQuestions } from "@/lib/trackerData";
import { assignmentFileUrl, getAssignmentFiles } from "@/lib/assignmentFilesData";
import { BOOKLET, sheetFor } from "@/lib/assignmentFiles";
import { daysBetween, formatHebrewDate, todayInIsrael, typeLabel } from "@/lib/semester";
import { AssignmentReader } from "@/components/AssignmentReader";
import { Icon } from "@/components/Icon";

export default function AssignmentPage({ params }: PageProps<"/courses/[code]/assignment/[n]">) {
  return (
    <Suspense fallback={<div className="aspect-[1/1.3] max-w-3xl animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
      <Assignment params={params} />
    </Suspense>
  );
}

async function Assignment({ params }: Pick<PageProps<"/courses/[code]/assignment/[n]">, "params">) {
  await connection();
  const { code, n } = await params;
  const [courses, files, questions, checks] = await Promise.all([getCourses(), getAssignmentFiles(code), getQuestions(code), getChecks(code)]);
  const course = courses.find((c) => c.code === code);
  if (!course) notFound();
  const a = course.assignments.find((x) => x.n === n);
  if (!a && n !== BOOKLET) notFound();
  const file = sheetFor(files, n);
  const url = file ? await assignmentFileUrl(file.path) : null;
  const label = a ? `${typeLabel[a.type]} ${a.n}` : "חוברת המטלות";
  const today = todayInIsrael();

  if (!file || !url)
    return (
      <div className="max-w-xl">
        <Link href={`/courses/${code}#assignments`} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
          <Icon name="chevronRight" className="size-4" />
          {course.name}
        </Link>
        <h1 className="mt-3 font-display text-3xl">{label}</h1>
        <p className="panel mt-6 p-5 text-ink-soft">
          {file ? "לא הצלחתי לפתוח את הקובץ. נסו לרענן את הדף." : "דף המטלה עוד לא הועלה. מעלים את קובצי המטלות פעם בסמסטר, בלשונית המטלות של הקורס."}
        </p>
      </div>
    );

  return (
    <AssignmentReader
      key={`${file.id}:${n}`}
      course={{ code, name: course.name, color: course.color }}
      assignment={{
        n,
        label,
        dueLabel: a ? formatHebrewDate(a.due, { weekday: "short", day: "numeric", month: "numeric" }) : null,
        daysLeft: a ? daysBetween(today, a.due) : null,
      }}
      file={{ id: file.id, name: file.name, url, page: file.lastPage ?? 1, booklet: file.n === BOOKLET }}
      others={course.assignments.filter((x) => sheetFor(files, x.n)).map((x) => ({ n: x.n, label: `${typeLabel[x.type]} ${x.n}` }))}
      tracked={
        a && a.type === "file"
          ? {
              n: a.n,
              label,
              dueLabel: formatHebrewDate(a.due, { day: "numeric", month: "numeric" }),
              daysLeft: daysBetween(today, a.due),
              questions: questions[a.n] ?? [],
              checks: checks[a.n] ?? [],
            }
          : null
      }
    />
  );
}
