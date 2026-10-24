"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Icon } from "@/components/Icon";
import { MathText } from "@/components/MathText";
import { markChapterDone, savePlace, searchMyBooks, setQuestionStatus } from "@/app/act";
import type { BookQuestion, SearchHit } from "@/lib/books";

interface ChapterLite {
  id: string;
  idx: number;
  title: string;
  pages: number;
  done: boolean;
  last_page: number | null;
}

interface Props {
  book: { id: string; title: string; course: string; courseName: string; color: string; forumHref?: string | null };
  chapters: ChapterLite[];
  chapter: ChapterLite & { url: string | null; summary: string | null; key_points: string[] | null; firstBookPage: number };
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
export function BookReader({ book, chapters, chapter, initialPage, questions, cardCount }: Props) {
  const [side, setSide] = useState<Side>("read");
  const [page, setPage] = useState(initialPage);
  const [done, setDone] = useState(chapter.done);
  const [zoom, setZoom] = useState(1);
  const jump = useRef<(p: number) => void>(() => {});
  const router = useRouter();
  const next = chapters.find((c) => c.idx === chapter.idx + 1);
  const prev = chapters.find((c) => c.idx === chapter.idx - 1);
  const go = (idx: number, p?: number) => router.push(`/books/${book.id}?ch=${idx}${p ? `&p=${p}` : ""}`);

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
    <div>
      {/* Top bar: back to the library, chapter picker, page, zoom */}
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.4rem)] z-[5] -mx-4 mb-4 border-b border-rule bg-bg/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-12 lg:px-12">
        <div className="flex items-center gap-2">
          <Link href={`/books?course=${book.course}`} className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface hover:text-ink" aria-label="לכל הספרים">
            <Icon name="chevronRight" className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-ink-soft">
              <span className="me-1.5 inline-block size-2 rounded-full align-middle" style={{ background: book.color }} aria-hidden />
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
          <span className="shrink-0 text-sm tabular-nums text-ink-soft" aria-live="polite">
            {page}/{chapter.pages}
          </span>
          <div className="hidden shrink-0 items-center gap-1 sm:flex">
            <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 0.25))} disabled={zoom <= 1} className="grid size-11 place-items-center rounded-full border border-rule-strong disabled:opacity-40 sm:size-9" aria-label="הקטנה">
              <Icon name="minus" className="size-4" />
            </button>
            <button type="button" onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))} className="grid size-11 place-items-center rounded-full border border-rule-strong sm:size-9" aria-label="הגדלה">
              <Icon name="plus" className="size-4" />
            </button>
          </div>
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

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className={side === "read" ? "" : "hidden lg:block"}>
          {chapter.url ? (
            <Pages url={chapter.url} chapterId={chapter.id} initialPage={initialPage} zoom={zoom} onPage={setPage} jumpRef={jump} />
          ) : (
            <p className="panel p-5 text-ink-soft">לא הצלחתי לפתוח את הקובץ. נסו לרענן את הדף.</p>
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
              <button type="button" onClick={() => go(next.idx)} className="inline-flex items-center gap-1 rounded-full border border-rule px-4 py-2.5 hover:border-ink">
                לפרק הבא
                <Icon name="chevronLeft" className="size-4" />
              </button>
            )}
            {prev && (
              <button type="button" onClick={() => go(prev.idx)} className="text-sm text-ink-soft underline decoration-rule underline-offset-4">
                לפרק הקודם
              </button>
            )}
          </div>
        </div>

        <aside className={`space-y-6 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto ${side === "read" ? "hidden lg:block" : ""}`}>
          <div className={side === "questions" ? "hidden lg:block" : ""}>
            <Summary chapter={chapter} cardCount={cardCount} course={book.course} forumHref={book.forumHref ?? null} />
          </div>
          <div className={side === "summary" ? "hidden lg:block" : ""}>
            <Questions questions={questions} onPage={toPage} />
          </div>
          <div className="hidden lg:block">
            <Search course={book.course} onHit={(h) => (h.book_id === book.id && h.chapter_idx === chapter.idx ? toPage(h.page) : go(h.chapter_idx, h.page))} bookId={book.id} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Summary({ chapter, cardCount, course, forumHref }: { chapter: Props["chapter"]; cardCount: number; course: string; forumHref: string | null }) {
  return (
    <section className="panel p-5">
      <h2 className="section-title">על הפרק</h2>
      {chapter.summary ? (
        <p className="mt-2 leading-relaxed"><MathText text={chapter.summary} /></p>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">הסיכום והשאלות של הפרק ייכתבו בסבב הבוקר הקרוב.</p>
      )}
      {chapter.key_points && chapter.key_points.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {chapter.key_points.map((k, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-soft" aria-hidden />
              <span><MathText text={k} /></span>
            </li>
          ))}
        </ul>
      )}
      {cardCount > 0 && (
        <Link href={`/study?course=${course}`} className="mt-4 inline-flex items-center gap-1.5 text-sm underline decoration-rule underline-offset-4">
          <Icon name="list" className="size-4" />
          {cardCount} כרטיסיות מהפרק בתרגול
        </Link>
      )}
      {forumHref && (
        <a href={forumHref} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink">
          <Icon name="help" className="size-4" />
          שאלה על הפרק? לפורומי הקורס
        </a>
      )}
    </section>
  );
}

function Questions({ questions, onPage }: { questions: BookQuestion[]; onPage: (p: number) => void }) {
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

function QuestionItem({ q, n, onPage }: { q: BookQuestion; n: number; onPage: (p: number) => void }) {
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
          <button type="button" onClick={() => onPage(q.page!)} className="underline decoration-rule underline-offset-4 hover:text-ink">
            עמ׳ {q.page} בפרק
          </button>
        )}
      </div>
      <p className="mt-1.5 whitespace-pre-line leading-relaxed"><MathText text={q.prompt} /></p>
      {open !== "none" && (
        <div className="mt-3 space-y-2 border-t border-rule pt-3 text-sm">
          {q.hint && (
            <p className="flex gap-2">
              <Icon name="bulb" className="mt-0.5 size-4 shrink-0 text-ink-soft" />
              <span className="whitespace-pre-line"><MathText text={q.hint} /></span>
            </p>
          )}
          {open === "answer" && <p className="whitespace-pre-line leading-relaxed"><MathText text={q.answer} /></p>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {open === "none" && q.hint && (
          <button type="button" onClick={() => setOpen("hint")} className="rounded-full border border-rule px-3 py-1 hover:border-ink">
            רמז
          </button>
        )}
        {open !== "answer" && (
          <button type="button" onClick={() => setOpen("answer")} className="rounded-full border border-rule px-3 py-1 hover:border-ink">
            פתרון
          </button>
        )}
        <span className="ms-auto flex gap-1">
          <button type="button" onClick={() => mark(status === "solved" ? null : "solved")} aria-pressed={status === "solved"} className={`rounded-full px-3 py-1 ${status === "solved" ? "bg-ink text-bg" : "text-ink-soft hover:text-ink"}`}>
            פתרתי
          </button>
          <button type="button" onClick={() => mark(status === "stuck" ? null : "stuck")} aria-pressed={status === "stuck"} className={`rounded-full px-3 py-1 ${status === "stuck" ? "bg-highlight text-highlight-ink" : "text-ink-soft hover:text-ink"}`}>
            נתקעתי
          </button>
        </span>
      </div>
    </li>
  );
}

export function Search({ course, onHit, bookId }: { course?: string; onHit?: (h: SearchHit) => void; bookId?: string }) {
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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש בספרים" className="min-w-0 flex-1 bg-transparent py-2 focus:outline-none" aria-label="חיפוש בספרים" />
      </form>
      {pending && <p className="mt-2 text-sm text-ink-soft">מחפש…</p>}
      {hits && !pending && (
        <ul className="mt-2 divide-y divide-rule text-sm">
          {hits.length === 0 && <li className="py-2 text-ink-soft">לא נמצא.</li>}
          {hits.map((h, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => (onHit ? onHit(h) : router.push(`/books/${h.book_id}?ch=${h.chapter_idx}&p=${h.page}`))}
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

/** The chapter's pages, drawn when they come near the screen and dropped when far away. */
function Pages({
  url,
  chapterId,
  initialPage,
  zoom,
  onPage,
  jumpRef,
}: {
  url: string;
  chapterId: string;
  initialPage: number;
  zoom: number;
  onPage: (p: number) => void;
  jumpRef: React.RefObject<(p: number) => void>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [ratio, setRatio] = useState(1.414);
  const [err, setErr] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const [current, setCurrent] = useState(initialPage);
  const drawn = useRef(new Map<number, { zoomKey: string; canvas: HTMLCanvasElement }>());

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
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const pageWidth = Math.round(width * zoom);

  const draw = useCallback(
    async (n: number) => {
      const slot = slots.current[n - 1];
      if (!doc || !slot || !pageWidth) return;
      const key = String(pageWidth);
      if (drawn.current.get(n)?.zoomKey === key) return;
      drawn.current.set(n, { zoomKey: key, canvas: document.createElement("canvas") });
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
    const sc = document.getElementById("scroller");
    const root = sc && /(auto|scroll)/.test(getComputedStyle(sc).overflowY) ? sc : null;
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
  }, [doc, draw, onPage]);

  // Jumping to a page, and opening at the remembered one.
  useEffect(() => {
    jumpRef.current = (p: number) => slots.current[Math.max(0, Math.min((doc?.numPages ?? 1) - 1, p - 1))]?.scrollIntoView({ block: "start" });
  }, [doc, jumpRef]);
  const opened = useRef(false);
  useEffect(() => {
    if (doc && width && !opened.current) {
      opened.current = true;
      if (initialPage > 1) requestAnimationFrame(() => jumpRef.current(initialPage));
    }
  }, [doc, width, initialPage, jumpRef]);

  // Save the place a moment after scrolling stops.
  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(() => savePlace(chapterId, current).catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, [current, chapterId, doc]);

  const pages = doc?.numPages ?? 0;
  return (
    <div ref={box} className={zoom > 1 ? "overflow-x-auto" : ""} dir="ltr">
      {err && <p className="panel p-5 text-ink-soft" dir="rtl">{err}</p>}
      {!doc && !err && <div className="aspect-[1/1.414] w-full animate-pulse rounded-lg bg-rule/50" aria-hidden />}
      <div style={{ width: pageWidth || undefined }} className="mx-auto space-y-3">
        {Array.from({ length: pages }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              slots.current[i] = el;
            }}
            data-page={i + 1}
            className="relative scroll-mt-40 overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-rule lg:scroll-mt-24"
            style={{ aspectRatio: `1 / ${ratio}` }}
            aria-label={`עמוד ${i + 1}`}
            role="img"
          />
        ))}
      </div>
    </div>
  );
}
