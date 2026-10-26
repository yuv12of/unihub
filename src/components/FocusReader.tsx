"use client";

import { useEffect, useRef, useState } from "react";
import { getFocusBook, markChapterDone } from "@/app/act";
import type { FocusBook } from "@/app/bookActions";
import { FitControls, Pages, useReaderKeys, useReaderView } from "@/components/BookReader";
import { Icon } from "@/components/Icon";

/**
 * The chapter to read during a focus session: the one given (from the reader's "read with a
 * timer"), else what the course's plan says to read next. Switching chapters fetches a new link.
 */
export function useFocusBook(courseCode: string | null, want: { bookId: string; idx: number } | null) {
  const [fb, setFb] = useState<FocusBook | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  const wantKey = want ? `${want.bookId}:${want.idx}` : "";
  useEffect(() => {
    let alive = true;
    const [bookId, idx] = wantKey ? wantKey.split(":") : [null, null];
    getFocusBook({ courseCode, bookId, idx: idx == null ? null : Number(idx) })
      .then((r) => {
        if (!alive) return;
        setFb(r);
        setState(r ? "ready" : "none");
      })
      .catch(() => alive && setState("none"));
    return () => {
      alive = false;
    };
  }, [courseCode, wantKey]);
  const open = async (idx: number) => {
    if (!fb) return;
    const r = await getFocusBook({ courseCode, bookId: fb.bookId, idx }).catch(() => null);
    if (r) setFb(r);
  };
  return { fb, state, open };
}

/**
 * The book inside the focus timer: a bar with the chapter, the page, fit and zoom, and the pages
 * below (scrolling inside the timer's own box). Ends with "finished the chapter" and the next one.
 */
export function FocusReader({
  fb,
  onChapter,
  scrollRoot,
  wide,
}: {
  fb: FocusBook;
  onChapter: (idx: number) => void;
  /** the timer's scrolling box (the pages watch it, not the window) */
  scrollRoot: HTMLElement | null;
  /** computer: fit and zoom controls, and arrow keys for pages */
  wide: boolean;
}) {
  const [page, setPage] = useState(fb.page);
  const [done, setDone] = useState(false);
  const [view, setView] = useReaderView("focus:reader");
  const jump = useRef<(p: number) => void>(() => {});
  const bar = useRef<HTMLDivElement>(null);
  const [barH, setBarH] = useState(56);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBarH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useReaderKeys({ page, pages: fb.pages, jump: (p) => jump.current(p), zoom: view.zoom, setZoom: (zoom) => setView({ zoom }), inDialog: true });
  const next = fb.chapters.find((c) => c.idx === fb.idx + 1);

  return (
    <div>
      <div ref={bar} className="sticky top-0 z-[5] flex items-center gap-3 border-b border-rule bg-bg/95 px-4 py-2 backdrop-blur lg:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-ink-soft">{fb.bookTitle}</p>
          <select value={fb.idx} onChange={(e) => onChapter(Number(e.target.value))} className="w-full truncate bg-transparent font-medium focus:outline-none" aria-label="פרק">
            {fb.chapters.map((c) => (
              <option key={c.idx} value={c.idx}>
                {c.done ? "✓ " : ""}
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <span className="shrink-0 text-sm tabular-nums text-ink-soft" aria-live="polite">
          עמ׳ {page} מתוך {fb.pages}
        </span>
        {wide && <FitControls fit={view.fit} zoom={view.zoom} onChange={setView} />}
      </div>

      <div className="px-4 py-4 lg:px-6">
        <Pages
          key={fb.chapterId}
          url={fb.url}
          chapterId={fb.chapterId}
          initialPage={fb.page}
          zoom={wide ? view.zoom : 1}
          fit={wide ? view.fit : "width"}
          scrollRoot={scrollRoot}
          topOffset={barH}
          onPage={setPage}
          jumpRef={jump}
        />
        <div className="mx-auto mt-6 flex max-w-xl flex-wrap items-center justify-center gap-3 pb-6">
          <button
            type="button"
            onClick={async () => {
              const v = !done;
              setDone(v);
              try {
                await markChapterDone(fb.chapterId, v);
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
            <button type="button" onClick={() => onChapter(next.idx)} className="inline-flex items-center gap-1 rounded-full border border-rule px-4 py-2.5 hover:border-ink">
              לפרק הבא
              <Icon name="chevronLeft" className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
