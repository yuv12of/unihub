import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getCourses } from "@/lib/userdata";
import { chapterCardCount, chapterUrl, getBook, getQuestions } from "@/lib/books";
import { BookReader } from "@/components/BookReader";

export default function ReaderPage({ params, searchParams }: PageProps<"/books/[id]">) {
  return (
    <Suspense fallback={<div className="aspect-[1/1.3] max-w-3xl animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
      <Reader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Reader({ params, searchParams }: Pick<PageProps<"/books/[id]">, "params" | "searchParams">) {
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const book = await getBook(id);
  if (!book || !book.chapters.length) notFound();
  const want = Number(sp.ch);
  const ch =
    book.chapters.find((c) => c.idx === want) ??
    [...book.chapters].filter((c) => c.read_at && !c.done_at).sort((a, b) => (b.read_at ?? "").localeCompare(a.read_at ?? ""))[0] ??
    book.chapters.find((c) => !c.done_at) ??
    book.chapters[0];
  const pages = ch.end_page - ch.start_page + 1;
  const p = Number(sp.p);
  const initialPage = Number.isFinite(p) && p >= 1 ? Math.min(p, pages) : ch.last_page && !ch.done_at ? Math.min(ch.last_page, pages) : 1;
  const [url, questions, cards, courses] = await Promise.all([chapterUrl(ch.storage_path), getQuestions(ch.id), chapterCardCount(ch.id), getCourses()]);
  const course = courses.find((c) => c.code === book.course_code);
  const lite = (c: (typeof book.chapters)[number]) => ({
    id: c.id,
    idx: c.idx,
    title: c.title,
    pages: c.end_page - c.start_page + 1,
    done: !!c.done_at,
    last_page: c.last_page,
  });
  return (
    <BookReader
      key={ch.id}
      book={{ id: book.id, title: book.title, course: book.course_code, courseName: course?.short ?? book.course_code, color: course?.color ?? "var(--ink-soft)", forumHref: course?.opalId ? `https://opal.openu.ac.il/mod/ouilforum/index.php?id=${course.opalId}` : null }}
      chapters={book.chapters.map(lite)}
      chapter={{ ...lite(ch), url, summary: ch.summary, key_points: ch.key_points, conclusion: ch.conclusion, firstBookPage: ch.start_page }}
      initialPage={initialPage}
      questions={questions}
      cardCount={cards}
    />
  );
}
