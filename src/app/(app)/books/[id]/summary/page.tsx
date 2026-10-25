import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getBook } from "@/lib/books";
import { getCourses } from "@/lib/userdata";
import { themeOf } from "@/lib/semester";
import { Conclusion } from "@/components/BookReader";
import { MathText } from "@/components/MathText";
import { PrintButton } from "@/components/PrintButton";

/** All chapter summaries of one book on one page: for revision before an exam, and for printing. */
export default function BookSummaryPage({ params }: PageProps<"/books/[id]/summary">) {
  return (
    <Suspense fallback={<div className="h-[32rem] max-w-3xl animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
      <Summaries params={params} />
    </Suspense>
  );
}

async function Summaries({ params }: Pick<PageProps<"/books/[id]/summary">, "params">) {
  await connection();
  const { id } = await params;
  const [book, courses] = await Promise.all([getBook(id), getCourses()]);
  if (!book) notFound();
  const theme = themeOf(courses, book.course_code);
  // teaching chapters: the ones with a conclusion or key points (not the cover, indexes, answers)
  const chapters = book.chapters.filter((c) => c.conclusion || (c.key_points && c.key_points.length > 0));
  const waiting = book.chapters.filter((c) => c.has_text && !c.conclusion && c.key_points && c.key_points.length > 0).length;

  return (
    <div className="mx-auto max-w-3xl">
      <style>{`@media print { .app-sidebar, .app-tabbar, header, .no-print { display: none !important; } .panel { break-inside: avoid; box-shadow: none; } details > p { display: block; } }`}</style>
      <Link href={`/books/${book.id}`} className="no-print text-sm text-ink-soft hover:text-ink">
        חזרה לספר
      </Link>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm text-ink-soft">
            <span className="size-2.5 rounded-full" style={{ background: theme.color }} aria-hidden />
            {theme.short}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl">סיכומי הפרקים: {book.title}</h1>
        </div>
        <PrintButton />
      </div>
      {waiting > 0 && <p className="no-print mt-2 text-sm text-ink-soft">{waiting === 1 ? "פרק אחד עוד מחכה" : `${waiting} פרקים עוד מחכים`} לסיכום המלא. הם נכתבים בסבבי הבוקר.</p>}

      {chapters.length > 1 && (
        <nav aria-label="פרקים" className="no-print mt-5 flex flex-wrap gap-1.5">
          {chapters.map((c) => (
            <a key={c.id} href={`#ch${c.idx}`} className="chip text-sm">
              {c.title}
            </a>
          ))}
        </nav>
      )}

      {!chapters.length && <p className="panel mt-6 p-5 text-ink-soft">עוד אין סיכומים לספר הזה. הם נכתבים בסבבי הבוקר, פרק אחרי פרק.</p>}

      <div className="mt-6 space-y-10">
        {chapters.map((c) => (
          <article key={c.id} id={`ch${c.idx}`} className="scroll-mt-20">
            <h2 className="text-2xl font-semibold">
              <Link href={`/books/${book.id}?ch=${c.idx}`} className="hover:underline">
                {c.title}
              </Link>
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              עמ׳ {c.start_page}–{c.end_page}
              {c.done_at ? " · נקרא" : ""}
            </p>
            {c.summary && (
              <p className="mt-3 leading-relaxed">
                <MathText text={c.summary} />
              </p>
            )}
            <div className="mt-4">
              {c.conclusion ? (
                <Conclusion c={c.conclusion} link={{ bookId: book.id, idx: c.idx }} />
              ) : (
                c.key_points && (
                  <ul className="panel space-y-1.5 p-5 text-sm">
                    {c.key_points.map((k, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-soft" aria-hidden />
                        <MathText text={k} />
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
