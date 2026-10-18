import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getCourses } from "@/lib/userdata";
import { continueChapter, getBooks, type Book } from "@/lib/books";
import { Search } from "@/components/BookReader";
import { Icon } from "@/components/Icon";
import { BookUpload } from "@/components/BookUpload";
import { RemoveBook } from "@/components/BookMenu";

export default function BooksPage({ searchParams }: PageProps<"/books">) {
  return (
    <>
      <h1 className="font-display text-4xl">ספרי הקורס</h1>
      <p className="mt-2 text-ink-soft">הספרים שלכם, מחולקים לפרקים, עם סיכום ושאלות תרגול לכל פרק.</p>
      <Suspense fallback={<div className="mt-8 h-96 animate-pulse rounded-xl bg-rule/60" aria-hidden />}>
        <Library searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Library({ searchParams }: { searchParams: PageProps<"/books">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const only = typeof sp.course === "string" ? sp.course : undefined;
  const [courses, all] = await Promise.all([getCourses(), getBooks()]);
  const books = only ? all.filter((b) => b.course_code === only) : all;
  const cont = continueChapter(books);
  const courseOf = (code: string) => courses.find((c) => c.code === code);
  const upload = <BookUpload courses={courses.map((c) => ({ code: c.code, short: c.short }))} defaultCourse={only} />;

  if (!all.length)
    return (
      <div className="panel mt-8 max-w-xl p-6">
        <Icon name="book" className="size-8 text-ink-soft" />
        <h2 className="section-title mt-3">עוד אין כאן ספרים</h2>
        <p className="mt-2 text-ink-soft">
          מעלים את ה־PDF של ספר הקורס, והוא מתחלק לפרקים לפי תוכן העניינים. הספר נשמר רק בחשבון שלכם.
        </p>
        <div className="mt-4">{upload}</div>
      </div>
    );

  const withBooks = courses.filter((c) => all.some((b) => b.course_code === c.code));
  return (
    <div className="mt-6 space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/books" className={`rounded-full border px-3.5 py-1.5 text-sm ${!only ? "border-ink bg-ink text-bg" : "border-rule"}`}>
          הכל
        </Link>
        {withBooks.map((c) => (
          <Link key={c.code} href={`/books?course=${c.code}`} className={`rounded-full border px-3.5 py-1.5 text-sm ${only === c.code ? "border-ink bg-ink text-bg" : "border-rule"}`}>
            <span className="me-1.5 inline-block size-2 rounded-full" style={{ background: c.color }} aria-hidden />
            {c.short}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          {cont && (
            <Link href={`/books/${cont.book.id}?ch=${cont.chapter.idx}`} className="block overflow-hidden rounded-2xl bg-ink p-5 text-bg">
              <p className="text-sm opacity-75">{cont.chapter.read_at ? "להמשיך מאיפה שעצרתם" : "להתחיל לקרוא"}</p>
              <p className="mt-1 text-xl font-semibold leading-snug">{cont.chapter.title}</p>
              <p className="mt-1 text-sm opacity-75">
                {courseOf(cont.book.course_code)?.short} · {cont.book.title}
                {cont.chapter.last_page ? ` · עמ׳ ${cont.chapter.last_page}` : ""}
              </p>
            </Link>
          )}
          {books.map((b) => (
            <BookCard key={b.id} book={b} color={courseOf(b.course_code)?.color ?? "var(--ink-soft)"} course={courseOf(b.course_code)?.short ?? b.course_code} />
          ))}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Search course={only} />
          {upload}
        </aside>
      </div>
    </div>
  );
}

function BookCard({ book, color, course }: { book: Book; color: string; course: string }) {
  const done = book.chapters.filter((c) => c.done_at).length;
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">
            <span className="me-1.5 inline-block size-2 rounded-full" style={{ background: color }} aria-hidden />
            {course} · {book.pages} עמ׳
          </p>
          <h2 className="section-title">{book.title}</h2>
        </div>
        <span className="shrink-0 text-sm tabular-nums text-ink-soft">
          {done}/{book.chapters.length} פרקים
        </span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-rule" aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${(done / Math.max(1, book.chapters.length)) * 100}%`, background: color }} />
      </div>
      <ol className="panel divide-y divide-rule overflow-hidden">
        {book.chapters.map((c) => (
          <li key={c.id}>
            <Link href={`/books/${book.id}?ch=${c.idx}`} className="flex items-center gap-3 px-4 py-3 hover:bg-bg">
              <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs tabular-nums ${c.done_at ? "bg-highlight text-highlight-ink" : "border border-rule"}`}>
                {c.done_at ? <Icon name="check" className="size-3.5" /> : c.idx}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${c.done_at ? "text-ink-soft" : "font-medium"}`}>{c.title}</span>
                <span className="block text-xs text-ink-soft">
                  {c.end_page - c.start_page + 1} עמ׳
                  {c.last_page && !c.done_at ? ` · עצרתם בעמ׳ ${c.last_page}` : ""}
                  {c.summary ? " · יש סיכום ושאלות" : ""}
                </span>
              </span>
              <Icon name="chevronLeft" className="size-4 shrink-0 text-ink-soft" />
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-2 text-end">
        <RemoveBook id={book.id} />
      </div>
    </section>
  );
}
