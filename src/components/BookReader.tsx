"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Icon } from "@/components/Icon";
import { MathText } from "@/components/MathText";
import {
  CheckCard,
  PretestCard,
  usePretest,
} from "@/components/practice/Pretest";
import {
  markChapterDone,
  savePlace,
  searchMyBooks,
  setQuestionStatus,
} from "@/app/act";
import type { BookQuestion, ChapterConclusion, SearchHit } from "@/lib/books";
import { FOCUS_EVENT, useMinWidth } from "@/components/focusShared";

interface ChapterLite {
  id: string;
  idx: number;
  title: string;
  pages: number;
  done: boolean;
  last_page: number | null;
}

interface Props {
  book: {
    id: string;
    title: string;
    course: string;
    courseName: string;
    color: string;
    forumHref?: string | null;
  };
  chapters: ChapterLite[];
  chapter: ChapterLite & {
    url: string | null;
    summary: string | null;
    key_points: string[] | null;
    conclusion: ChapterConclusion | null;
    firstBookPage: number;
  };
  initialPage: number;
  questions: BookQuestion[];
  cardCount: number;
}

type Side = "read" | "summary" | "questions";

/**
 * Reads one chapter of a course book: the real pages (pdf.js, drawn only near the screen so long
 * chapters stay light on a phone), the place remembered, and the chapter's summary, practice
 * questions and flashcards beside it (under tabs on a phone).
 */
export function BookReader({
  book,
  chapters,
  chapter,
  initialPage,
  questions,
  cardCount,
}: Props) {
  const [side, setSide] = useState<Side>("read");
  const [page, setPage] = useState(initialPage);
  const [done, setDone] = useState(chapter.done);
  // fit, zoom and the side panel: from a tablet up (a phone always fits the width)
  const [view, setView] = useReaderView();
  const roomy = useMinWidth(640);
  const wide = useMinWidth(1024);
  const xl = useMinWidth(1280);
  // the summary panel: docked beside the pages on a big screen, a drawer on a small laptop (where
  // docking it would squeeze the page), and tabs on a phone
  const [drawer, setDrawer] = useState(false);
  const docked = xl && view.panel;
  const panelShown = !wide || (xl ? view.panel : drawer);
  const togglePanel = () => (xl ? setView({ panel: !view.panel }) : setDrawer(!drawer));
  useEffect(() => {
    if (!drawer) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [drawer]);
  const jump = useRef<(p: number) => void>(() => {});
  useReaderKeys({ page, pages: chapter.pages, jump: (p) => jump.current(p), zoom: view.zoom, setZoom: (zoom) => setView({ zoom }) });
  const router = useRouter();
  // pretest: two questions before the first read, the same ones again once the chapter is done
  const [pre, setPre] = usePretest(chapter.id);
  const next = chapters.find((c) => c.idx === chapter.idx + 1);
  const prev = chapters.find((c) => c.idx === chapter.idx - 1);
  const go = (idx: number, p?: number) =>
    router.push(`/books/${book.id}?ch=${idx}${p ? `&p=${p}` : ""}`);

  const toPage = (p: number) => {
    setSide("read");
    // let the reader tab show before scrolling (phone)
    requestAnimationFrame(() => jump.current(p));
  };

  const tabs: [Side, string][] = [
    ["read", "קריאה"],
    ["summary", "סיכום"],
    ["questions", `שאלות${questions.length ? ` (${questions.length})` : ""}`],
  ];

  return (
    // data-wide: on a computer the app's main column lets this page use the whole width
    <div data-wide>
      {/* Top bar: back to the library, chapter picker, page, fit and zoom, panel, timer */}
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.4rem)] z-[5] -mx-4 mb-4 border-b border-rule bg-bg/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8 lg:py-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/books?course=${book.course}`}
            className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface hover:text-ink"
            aria-label="לכל הספרים"
          >
            <Icon name="chevronRight" className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-ink-soft">
              <span
                className="me-1.5 inline-block size-2 rounded-full align-middle"
                style={{ background: book.color }}
                aria-hidden
              />
              {book.courseName} · {book.title}
            </p>
            <select
              value={chapter.idx}
              onChange={(e) => go(Number(e.target.value))}
              className="w-full truncate bg-transparent font-medium focus:outline-none"
              aria-label="פרק"
            >
              {chapters.map((c) => (
                <option key={c.id} value={c.idx}>
                  {c.done ? "✓ " : ""}
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <span
            className="shrink-0 text-sm tabular-nums text-ink-soft"
            aria-live="polite"
          >
            {page}/{chapter.pages}
          </span>
          <div className="hidden sm:flex">
            <FitControls fit={view.fit} zoom={view.zoom} onChange={setView} />
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: { course: book.course, book: book.id, idx: chapter.idx } }))}
            className="hidden shrink-0 items-center gap-1.5 rounded-full border border-rule-strong px-3 py-1.5 text-sm hover:border-ink sm:inline-flex"
            aria-label="לקרוא עם טיימר"
            title="לקרוא עם טיימר ריכוז"
          >
            <Icon name="timer" className="size-4" />
            <span className="sm:max-lg:hidden lg:max-xl:hidden">לקרוא עם טיימר</span>
          </button>
          <button
            type="button"
            onClick={togglePanel}
            aria-pressed={panelShown}
            aria-label="סיכום ושאלות"
            className="hidden shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink-soft hover:text-ink lg:inline-flex"
          >
            <Icon name="list" className="size-4" />
            <span className="hidden xl:inline">{panelShown ? "הסתרת הסיכום" : "סיכום ושאלות"}</span>
          </button>
        </div>
        <div className="mt-2 flex gap-1 lg:hidden" role="tablist">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={side === k}
              onClick={() => setSide(k)}
              className={`flex-1 rounded-full py-1.5 text-sm ${side === k ? "bg-accent text-on-accent" : "text-ink-soft"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid items-start gap-8 ${docked ? "xl:grid-cols-[minmax(0,1fr)_23rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]" : ""}`}>
        <div className={side === "read" ? "" : "hidden lg:block"}>
          {pre.pretest && (
            <PretestCard
              chapterId={chapter.id}
              questions={pre.pretest}
              onDone={(seen) => setPre({ pretest: null, check: seen })}
            />
          )}
          {chapter.url ? (
            <Pages
              url={chapter.url}
              chapterId={chapter.id}
              initialPage={initialPage}
              zoom={roomy ? view.zoom : 1}
              fit={roomy ? view.fit : "width"}
              topOffset={wide ? 72 : roomy ? 160 : 0}
              onPage={setPage}
              jumpRef={jump}
            />
          ) : (
            <p className="panel p-5 text-ink-soft">
              לא הצלחתי לפתוח את הקובץ. נסו לרענן את הדף.
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                const v = !done;
                setDone(v);
                try {
                  await markChapterDone(chapter.id, v);
                } catch {
                  setDone(!v);
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 font-medium ${done ? "border border-rule" : "bg-ink text-bg"}`}
            >
              <Icon name="check" className="size-4" />
              {done ? "סומן כנקרא" : "סיימתי את הפרק"}
            </button>
            {next && (
              <button
                type="button"
                onClick={() => go(next.idx)}
                className="inline-flex items-center gap-1 rounded-full border border-rule px-4 py-2.5 hover:border-ink"
              >
                לפרק הבא
                <Icon name="chevronLeft" className="size-4" />
              </button>
            )}
            {prev && (
              <button
                type="button"
                onClick={() => go(prev.idx)}
                className="text-sm text-ink-soft underline decoration-rule underline-offset-4"
              >
                לפרק הקודם
              </button>
            )}
          </div>
          {chapter.conclusion?.bottom_line && (
            <section className="panel mt-6 p-5">
              <h2 className="section-title">סיכום הפרק</h2>
              <p className="mt-2 leading-relaxed">
                <MathText text={chapter.conclusion.bottom_line} />
              </p>
              <button
                type="button"
                onClick={() => setSide("summary")}
                className="mt-3 text-sm underline decoration-rule underline-offset-4 lg:hidden"
              >
                לסיכום המלא: הגדרות, משפטים ובדיקה עצמית
              </button>
              <p className="mt-3 hidden text-sm text-ink-soft lg:block">
                הסיכום המלא בצד: מה חייבים לדעת, טעויות נפוצות ובדיקה עצמית.
              </p>
            </section>
          )}
          {done && pre.check && pre.check.length > 0 && (
            <CheckCard
              chapterId={chapter.id}
              questions={pre.check}
              onDone={() => setPre((p) => ({ ...p, check: null }))}
            />
          )}
        </div>

        {wide && !xl && drawer && <div className="fixed inset-0 z-30 bg-black/30" onClick={() => setDrawer(false)} aria-hidden />}
        <aside
          className={`space-y-6 ${side === "read" ? "hidden lg:block" : ""} ${
            wide && !panelShown
              ? "lg:hidden"
              : docked
                ? "xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:self-start xl:overflow-y-auto"
                : "lg:fixed lg:inset-y-0 lg:end-0 lg:z-40 lg:w-[min(26rem,90vw)] lg:overflow-y-auto lg:border-s lg:border-rule lg:bg-bg lg:p-6 lg:shadow-2xl"
          }`}
          aria-label="סיכום ושאלות"
        >
          {wide && !xl && (
            <button type="button" onClick={() => setDrawer(false)} className="btn-ghost -mt-1 ms-auto flex rounded-lg px-2 text-sm text-ink-soft">
              <Icon name="close" className="size-4" />
              סגירה
            </button>
          )}
          <div className={side === "questions" ? "hidden lg:block" : ""}>
            <Summary
              chapter={chapter}
              cardCount={cardCount}
              course={book.course}
              forumHref={book.forumHref ?? null}
              onPage={toPage}
              bookId={book.id}
            />
          </div>
          <div className={side === "summary" ? "hidden lg:block" : ""}>
            <Questions questions={questions} onPage={toPage} />
          </div>
          <div className="hidden lg:block">
            <Search
              course={book.course}
              onHit={(h) =>
                h.book_id === book.id && h.chapter_idx === chapter.idx
                  ? toPage(h.page)
                  : go(h.chapter_idx, h.page)
              }
              bookId={book.id}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Summary({
  chapter,
  cardCount,
  course,
  forumHref,
  onPage,
  bookId,
}: {
  chapter: Props["chapter"];
  cardCount: number;
  course: string;
  forumHref: string | null;
  onPage: (p: number) => void;
  bookId: string;
}) {
  return (
    <>
      <section className="panel p-5">
        <h2 className="section-title">על הפרק</h2>
        {chapter.summary ? (
          <p className="mt-2 leading-relaxed">
            <MathText text={chapter.summary} />
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">
            הסיכום והשאלות של הפרק ייכתבו בסבב הבוקר הקרוב.
          </p>
        )}
        {chapter.key_points && chapter.key_points.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm">
            {chapter.key_points.map((k, i) => (
              <li key={i} className="flex gap-2">
                <span
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-soft"
                  aria-hidden
                />
                <span>
                  <MathText text={k} />
                </span>
              </li>
            ))}
          </ul>
        )}
        {cardCount > 0 && (
          <Link
            href={`/study?course=${course}`}
            className="mt-4 inline-flex items-center gap-1.5 text-sm underline decoration-rule underline-offset-4"
          >
            <Icon name="list" className="size-4" />
            {cardCount} כרטיסיות מהפרק בתרגול
          </Link>
        )}
        {forumHref && (
          <a
            href={forumHref}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink"
          >
            <Icon name="help" className="size-4" />
            שאלה על הפרק? לפורומי הקורס
          </a>
        )}
      </section>
      {chapter.conclusion && (
        <Conclusion c={chapter.conclusion} onPage={onPage} />
      )}
      <Link
        href={`/books/${bookId}/summary`}
        className="block text-center text-sm text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink"
      >
        כל סיכומי הספר בעמוד אחד
      </Link>
    </>
  );
}

const KIND: Record<ChapterConclusion["must_know"][number]["kind"], string> = {
  def: "הגדרה",
  thm: "משפט",
  method: "שיטה",
};

/** "סיכום הפרק": the bottom line, what to know (jumps to its page), common mistakes, a self-check. */
export function Conclusion({
  c,
  onPage,
  link,
}: {
  c: ChapterConclusion;
  onPage?: (p: number) => void;
  /** on the book's summaries page: page numbers link into the reader */
  link?: { bookId: string; idx: number };
}) {
  return (
    <section className="panel p-5">
      <h2 className="section-title">סיכום הפרק</h2>
      {c.bottom_line && (
        <p className="mt-2 rounded-lg bg-bg p-3 font-medium leading-relaxed">
          <MathText text={c.bottom_line} />
        </p>
      )}
      {c.must_know.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold">חייבים לדעת</h3>
          <ul className="mt-2 space-y-2.5 text-sm">
            {c.must_know.map((m, i) => (
              <li key={i}>
                <span className="me-1.5 rounded bg-bg px-1.5 py-0.5 text-[11px] text-ink-soft">
                  {KIND[m.kind]}
                </span>
                <b>
                  <MathText text={m.title} />
                </b>
                {m.page && onPage && (
                  <button
                    type="button"
                    onClick={() => onPage(m.page!)}
                    className="ms-1.5 text-xs text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink"
                  >
                    עמ׳ {m.page}
                  </button>
                )}
                {m.page && !onPage && link && (
                  <Link
                    href={`/books/${link.bookId}?ch=${link.idx}&p=${m.page}`}
                    className="ms-1.5 text-xs text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink"
                  >
                    עמ׳ {m.page}
                  </Link>
                )}
                {m.text && (
                  <span className="mt-0.5 block leading-relaxed text-ink-soft">
                    <MathText text={m.text} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {c.pitfalls.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold">טעויות נפוצות</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {c.pitfalls.map((p, i) => (
              <li key={i} className="flex gap-2">
                <Icon
                  name="alert"
                  className="mt-0.5 size-4 shrink-0 text-ink-soft"
                />
                <span>
                  <MathText text={p} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {c.self_check.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold">בדיקה עצמית</h3>
          <ol className="mt-2 space-y-2 text-sm">
            {c.self_check.map((x, i) => (
              <li key={i}>
                <details className="group rounded-lg border border-rule px-3 py-2">
                  <summary className="cursor-pointer list-none">
                    <span className="me-1 tabular-nums text-ink-soft">
                      {i + 1}.
                    </span>
                    <MathText text={x.q} />
                    <span className="ms-2 text-xs text-ink-soft underline decoration-rule underline-offset-4 group-open:hidden">
                      תשובה
                    </span>
                  </summary>
                  <p className="mt-2 border-t border-rule pt-2 leading-relaxed text-ink-soft">
                    <MathText text={x.a} />
                  </p>
                </details>
              </li>
            ))}
          </ol>
        </>
      )}
      {c.next && (
        <p className="mt-4 text-sm text-ink-soft">
          <b className="font-medium text-ink">ומה הלאה: </b>
          <MathText text={c.next} />
        </p>
      )}
    </section>
  );
}

function Questions({
  questions,
  onPage,
}: {
  questions: BookQuestion[];
  onPage: (p: number) => void;
}) {
  if (!questions.length) return null;
  return (
    <section>
      <h2 className="section-title mb-3">שאלות תרגול</h2>
      <ol className="space-y-3">
        {questions.map((q, i) => (
          <QuestionItem key={q.id} q={q} n={i + 1} onPage={onPage} />
        ))}
      </ol>
    </section>
  );
}

const LEVEL = ["", "קלה", "בינונית", "מאתגרת"];

function QuestionItem({
  q,
  n,
  onPage,
}: {
  q: BookQuestion;
  n: number;
  onPage: (p: number) => void;
}) {
  const [open, setOpen] = useState<"none" | "hint" | "answer">("none");
  const [status, setStatus] = useState(q.status);
  const [, start] = useTransition();
  const mark = (s: typeof status) =>
    start(async () => {
      const prev = status;
      setStatus(s);
      try {
        await setQuestionStatus(q.id, s);
      } catch {
        setStatus(prev);
      }
    });
  return (
    <li className={`panel p-4 ${status === "solved" ? "opacity-70" : ""}`}>
      <div className="flex items-baseline justify-between gap-2 text-xs text-ink-soft">
        <span>
          שאלה {n} · {LEVEL[q.difficulty]}
        </span>
        {q.page && (
          <button
            type="button"
            onClick={() => onPage(q.page!)}
            className="underline decoration-rule underline-offset-4 hover:text-ink"
          >
            עמ׳ {q.page} בפרק
          </button>
        )}
      </div>
      <p className="mt-1.5 whitespace-pre-line leading-relaxed">
        <MathText text={q.prompt} />
      </p>
      {open !== "none" && (
        <div className="mt-3 space-y-2 border-t border-rule pt-3 text-sm">
          {q.hint && (
            <p className="flex gap-2">
              <Icon
                name="bulb"
                className="mt-0.5 size-4 shrink-0 text-ink-soft"
              />
              <span className="whitespace-pre-line">
                <MathText text={q.hint} />
              </span>
            </p>
          )}
          {open === "answer" && (
            <p className="whitespace-pre-line leading-relaxed">
              <MathText text={q.answer} />
            </p>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {open === "none" && q.hint && (
          <button
            type="button"
            onClick={() => setOpen("hint")}
            className="rounded-full border border-rule px-3 py-1 hover:border-ink"
          >
            רמז
          </button>
        )}
        {open !== "answer" && (
          <button
            type="button"
            onClick={() => setOpen("answer")}
            className="rounded-full border border-rule px-3 py-1 hover:border-ink"
          >
            פתרון
          </button>
        )}
        <span className="ms-auto flex gap-1">
          <button
            type="button"
            onClick={() => mark(status === "solved" ? null : "solved")}
            aria-pressed={status === "solved"}
            className={`rounded-full px-3 py-1 ${status === "solved" ? "bg-ink text-bg" : "text-ink-soft hover:text-ink"}`}
          >
            פתרתי
          </button>
          <button
            type="button"
            onClick={() => mark(status === "stuck" ? null : "stuck")}
            aria-pressed={status === "stuck"}
            className={`rounded-full px-3 py-1 ${status === "stuck" ? "bg-highlight text-highlight-ink" : "text-ink-soft hover:text-ink"}`}
          >
            נתקעתי
          </button>
        </span>
      </div>
    </li>
  );
}

export function Search({
  course,
  onHit,
  bookId,
}: {
  course?: string;
  onHit?: (h: SearchHit) => void;
  bookId?: string;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            try {
              setHits(await searchMyBooks(q, course));
            } catch {
              setHits([]);
            }
          });
        }}
        className="flex items-center gap-2 rounded-full border border-rule bg-surface px-3 focus-within:border-ink"
      >
        <Icon name="search" className="size-4 text-ink-soft" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש בספרים"
          className="min-w-0 flex-1 bg-transparent py-2 focus:outline-none"
          aria-label="חיפוש בספרים"
        />
      </form>
      {pending && <p className="mt-2 text-sm text-ink-soft">מחפש…</p>}
      {hits && !pending && (
        <ul className="mt-2 divide-y divide-rule text-sm">
          {hits.length === 0 && (
            <li className="py-2 text-ink-soft">לא נמצא.</li>
          )}
          {hits.map((h, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() =>
                  onHit
                    ? onHit(h)
                    : router.push(
                        `/books/${h.book_id}?ch=${h.chapter_idx}&p=${h.page}`,
                      )
                }
                className="block w-full py-2 text-start hover:bg-bg"
              >
                <span className="block text-xs text-ink-soft">
                  {h.book_id !== bookId ? `${h.book} · ` : ""}
                  {h.chapter} · עמ׳ {h.page}
                </span>
                <span className="line-clamp-2">{h.snippet}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export type Fit = "width" | "page";

/**
 * Reader view settings on a computer: how pages fit (the column's width, or a whole page in view),
 * the zoom on top of that, and whether the summary panel is open. Kept in this browser.
 */
export function useReaderView(key = "reader:view") {
  const [view, setView] = useState<{ fit: Fit; zoom: number; panel: boolean }>({ fit: "width", zoom: 1, panel: true });
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a browser-only preference, read once after mount
      if (v && (v.fit === "width" || v.fit === "page")) setView({ fit: v.fit, zoom: Number(v.zoom) || 1, panel: v.panel !== false });
    } catch {}
  }, [key]);
  const update = (p: Partial<typeof view>) =>
    setView((v) => {
      const n = { ...v, ...p, zoom: Math.round(Math.min(3, Math.max(0.5, p.zoom ?? v.zoom)) * 100) / 100 };
      try {
        localStorage.setItem(key, JSON.stringify(n));
      } catch {}
      return n;
    });
  return [view, update] as const;
}

/** Fit (width / whole page) and zoom buttons for the reader's bar. */
export function FitControls({ fit, zoom, onChange }: { fit: Fit; zoom: number; onChange: (p: { fit?: Fit; zoom?: number }) => void }) {
  const seg = (on: boolean) => `rounded-full px-3 py-1.5 text-sm ${on ? "bg-accent text-on-accent" : "text-ink-soft hover:text-ink"}`;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="flex rounded-full border border-rule p-0.5" role="group" aria-label="התאמת העמוד">
        <button type="button" onClick={() => onChange({ fit: "width", zoom: 1 })} aria-pressed={fit === "width"} className={seg(fit === "width")}>
          לרוחב
        </button>
        <button type="button" onClick={() => onChange({ fit: "page", zoom: 1 })} aria-pressed={fit === "page"} className={seg(fit === "page")}>
          עמוד שלם
        </button>
      </div>
      <button type="button" onClick={() => onChange({ zoom: zoom - 0.1 })} disabled={zoom <= 0.5} className="grid size-9 place-items-center rounded-full border border-rule-strong disabled:opacity-40" aria-label="הקטנה">
        <Icon name="minus" className="size-4" />
      </button>
      <span className="w-11 text-center text-sm tabular-nums text-ink-soft" aria-live="polite">
        {Math.round(zoom * 100)}%
      </span>
      <button type="button" onClick={() => onChange({ zoom: zoom + 0.1 })} disabled={zoom >= 3} className="grid size-9 place-items-center rounded-full border border-rule-strong disabled:opacity-40" aria-label="הגדלה">
        <Icon name="plus" className="size-4" />
      </button>
    </div>
  );
}

/**
 * Reader keys on a computer: ← / → the next / previous page (right-to-left book), + / − zoom,
 * 0 back to 100%. Ignored while typing.
 */
export function useReaderKeys({ page, pages, jump, zoom, setZoom, inDialog = false }: { page: number; pages: number; jump: (p: number) => void; zoom: number; setZoom: (z: number) => void; inDialog?: boolean }) {
  const live = useRef({ page, pages, jump, zoom, setZoom });
  useEffect(() => {
    live.current = { page, pages, jump, zoom, setZoom };
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target;
      if (e.metaKey || e.ctrlKey || e.altKey || (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
      // the page's own reader stays still while the focus timer covers it
      if (!inDialog && document.querySelector("[role=dialog][aria-modal]")) return;
      const l = live.current;
      const go = (f: () => void) => {
        e.preventDefault();
        f();
      };
      if (e.key === "ArrowLeft") go(() => l.jump(Math.min(l.pages, l.page + 1)));
      else if (e.key === "ArrowRight") go(() => l.jump(Math.max(1, l.page - 1)));
      else if (e.key === "+" || e.key === "=") go(() => l.setZoom(l.zoom + 0.1));
      else if (e.key === "-") go(() => l.setZoom(l.zoom - 0.1));
      else if (e.key === "0") go(() => l.setZoom(1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [inDialog]);
}

/** The chapter's pages, drawn when they come near the screen and dropped when far away. */
export function Pages({
  url,
  chapterId,
  initialPage,
  zoom,
  onPage,
  jumpRef,
  fit = "width",
  scrollRoot = null,
  topOffset = 0,
}: {
  url: string;
  chapterId: string;
  initialPage: number;
  zoom: number;
  onPage: (p: number) => void;
  jumpRef: React.RefObject<(p: number) => void>;
  /** "page": a whole page fits the height that's left under the bars */
  fit?: Fit;
  /** the box that scrolls (inside the focus timer); default: the app's scroller or the window */
  scrollRoot?: HTMLElement | null;
  /** height of the bars stuck above the pages, for "whole page" and for jumping */
  topOffset?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [ratio, setRatio] = useState(1.414);
  const [err, setErr] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [viewH, setViewH] = useState(0);
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const [current, setCurrent] = useState(initialPage);
  const drawn = useRef(
    new Map<number, { zoomKey: string; canvas: HTMLCanvasElement }>(),
  );

  useEffect(() => {
    let cancelled = false;
    let task: { destroy(): Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const t = pdfjs.getDocument({
          url,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          disableAutoFetch: true,
          rangeChunkSize: 262144,
        });
        task = t;
        const d = await t.promise;
        if (cancelled) return;
        const first = await d.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        setRatio(vp.height / vp.width);
        setDoc(d);
      } catch {
        if (!cancelled) setErr("לא הצלחתי לטעון את הפרק.");
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth);
      setViewH(scrollRoot ? scrollRoot.clientHeight : window.innerHeight);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (scrollRoot) ro.observe(scrollRoot);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [scrollRoot]);

  // "page": as wide as a whole page can be while it still fits under the bars
  const fitWidth = fit === "page" && viewH ? Math.min(width, Math.max(240, (viewH - topOffset - 24) / ratio)) : width;
  const pageWidth = Math.round(fitWidth * zoom);

  const draw = useCallback(
    async (n: number) => {
      const slot = slots.current[n - 1];
      if (!doc || !slot || !pageWidth) return;
      const key = String(pageWidth);
      if (drawn.current.get(n)?.zoomKey === key) return;
      drawn.current.set(n, {
        zoomKey: key,
        canvas: document.createElement("canvas"),
      });
      try {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp = page.getViewport({ scale: (pageWidth / base.width) * dpr });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        await page.render({ canvas, viewport: vp }).promise;
        if (drawn.current.get(n)?.zoomKey !== key) return;
        drawn.current.set(n, { zoomKey: key, canvas });
        slot.replaceChildren(canvas);
      } catch {
        drawn.current.delete(n);
      }
    },
    [doc, pageWidth],
  );

  const drop = (n: number) => {
    const d = drawn.current.get(n);
    if (!d) return;
    d.canvas.width = 0;
    d.canvas.height = 0;
    drawn.current.delete(n);
    slots.current[n - 1]?.replaceChildren();
  };

  // Draw pages near the screen, drop ones far away, and track the page being read.
  useEffect(() => {
    if (!doc) return;
    // On a phone the app scrolls inside #scroller, not the window: watch that box.
    const sc = scrollRoot ?? document.getElementById("scroller");
    const root =
      sc && /(auto|scroll)/.test(getComputedStyle(sc).overflowY) ? sc : null;
    const near = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.page);
          if (e.isIntersecting) draw(n);
          else drop(n);
        }
      },
      { root, rootMargin: "1600px 0px" },
    );
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            const n = Number((e.target as HTMLElement).dataset.page);
            onPage(n);
            setCurrent(n);
          }
      },
      { root, rootMargin: "-45% 0px -45% 0px" },
    );
    slots.current.forEach((s) => {
      if (s) {
        near.observe(s);
        seen.observe(s);
      }
    });
    return () => {
      near.disconnect();
      seen.disconnect();
    };
  }, [doc, draw, onPage, scrollRoot]);

  // Jumping to a page, and opening at the remembered one.
  useEffect(() => {
    jumpRef.current = (p: number) =>
      slots.current[
        Math.max(0, Math.min((doc?.numPages ?? 1) - 1, p - 1))
      ]?.scrollIntoView({ block: "start" });
  }, [doc, jumpRef]);
  const opened = useRef(false);
  useEffect(() => {
    if (doc && width && !opened.current) {
      opened.current = true;
      if (initialPage > 1)
        requestAnimationFrame(() => jumpRef.current(initialPage));
    }
  }, [doc, width, initialPage, jumpRef]);
  // a new page size (fit, zoom, a resized window) keeps the page being read in view
  const reading = useRef(current);
  useEffect(() => {
    reading.current = current;
  }, [current]);
  const lastWidth = useRef(0);
  useEffect(() => {
    const was = lastWidth.current;
    lastWidth.current = pageWidth;
    if (opened.current && was && pageWidth && was !== pageWidth) requestAnimationFrame(() => jumpRef.current(reading.current));
  }, [pageWidth, jumpRef]);

  // Save the place a moment after scrolling stops.
  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(
      () => savePlace(chapterId, current).catch(() => {}),
      1500,
    );
    return () => clearTimeout(t);
  }, [current, chapterId, doc]);

  const pages = doc?.numPages ?? 0;
  return (
    <div ref={box} className={pageWidth > width ? "overflow-x-auto" : ""} dir="ltr">
      {err && (
        <p className="panel p-5 text-ink-soft" dir="rtl">
          {err}
        </p>
      )}
      {!doc && !err && (
        <div
          className="aspect-[1/1.414] w-full animate-pulse rounded-lg bg-rule/50"
          aria-hidden
        />
      )}
      <div
        style={{ width: pageWidth || undefined }}
        className="mx-auto space-y-3"
      >
        {Array.from({ length: pages }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              slots.current[i] = el;
            }}
            data-page={i + 1}
            className={`relative overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-rule ${topOffset ? "" : "scroll-mt-40 lg:scroll-mt-24"}`}
            style={{ aspectRatio: `1 / ${ratio}`, scrollMarginTop: topOffset ? topOffset + 8 : undefined }}
            aria-label={`עמוד ${i + 1}`}
            role="img"
          />
        ))}
      </div>
    </div>
  );
}
