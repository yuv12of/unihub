import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { MockExam } from "@/components/MockExam";
import { getPastExam } from "@/lib/exams";

export default function MockPage({ params }: PageProps<"/courses/[code]/mock/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
      <Mock params={params} />
    </Suspense>
  );
}

async function Mock({ params }: Pick<PageProps<"/courses/[code]/mock/[id]">, "params">) {
  await connection();
  const { code, id } = await params;
  const exam = await getPastExam(id);
  if (!exam || exam.course_code !== code) notFound();
  return <MockExam examId={exam.id} code={code} label={exam.label} url={exam.url} minutes={exam.duration_minutes} questions={exam.questions} />;
}
