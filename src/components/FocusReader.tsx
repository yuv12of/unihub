"use client";

import { useEffect, useRef, useState } from "react";
import { getFocusAssignment, getFocusBook, markChapterDone, saveAssignmentPlace, savePlace } from "@/app/act";
import type { FocusBook } from "@/app/bookActions";
import type { FocusAssignment } from "@/app/assignmentFileActions";
import { FitControls, Pages, useReaderKeys, useReaderView } from "@/components/BookReader";
import { Icon, type IconName } from "@/components/Icon";

/** A file to read inside the focus timer: a book chapter or an assignment sheet. */
export interface ReaderDoc {
  /** changes when another file opens (resets the reader) */
  key: string;
  /** small line above the picker: the book, or "מטלות הקורס" */
  heading: string;
  url: string;
  /** where to open */
  page: number;
  /** known page count (books); assignment sheets report theirs once open */
  pages?: number;
  /** the picker: chapters of the book, or the course's assignments with a sheet */
  options: { value: string; label: string; done?: boolean }[];
  current: string;
  pickLabel: string;
  onPick: (value: string) => void;
  onSave: (page: number) => void;
  /** the "read during this time" card on the timer */
  cta: { title: string; sub: string; icon: IconName };
  kind: "book" | "assignment";
  /** book chapters: the chapter id, for "finished the chapter" */
  chapterId?: string;
  /** book chapters: the next chapter's value */
  next?: string | null;
}

type Want = { book?: { bookId: string; idx: number } | null; assignment?: string | null; preferAssignment?: boolean };

/** What the focus timer can show besides the clock: the book chapter, the assignment, or its link. */
export interface FocusDocs {
  book: ReaderDoc | null;
  assignment: ReaderDoc | null;
  /** an online assignment: open it on Opal (it can't be read inside the timer) */
  link: { title: string; sub: string; url: string } | null;
  /** which one this session is about (an assignment session, or one opened from an assignment) */
  prefer: "book" | "assignment";
  ready: boolean;
}

/**
 * What to read in this focus session: the chapter given (else what the course's plan says to read
 * next) and the assignment given (else the next one due), both offered in every session. An
 * assignment session, or one opened from an assignment, starts on the assignment.
 */
export function useFocusDoc(courseCode: string | null, want: Want): FocusDocs {
  const [fb, setFb] = useState<FocusBook | null>(null);
  const [fa, setFa] = useState<FocusAssignment | null>(null);
  const [ready, setReady] = useState(false);
  const bookKey = want.book ? `${want.book.bookId}:${want.book.idx}` : "";
  const aKey = want.assignment ?? "";

  useEffect(() => {
    let alive = true;
    const [bookId, idx] = bookKey ? bookKey.split(":") : [null, null];
    Promise.all([
      getFocusBook({ courseCode, bookId, idx: idx == null ? null : Number(idx) }).catch(() => null),
      getFocusAssignment({ courseCode, n: aKey || null }).catch(() => null),
    ]).then(([b, a]) => {
      if (!alive) return;
      setFb(b);
      setFa(a);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [courseCode, bookKey, aKey]);

  const openChapter = async (v: string) => {
    if (!fb) return;
    const r = await getFocusBook({ courseCode, bookId: fb.bookId, idx: Number(v) }).catch(() => null);
    if (r) setFb(r);
  };
  const openAssignment = async (n: string) => {
    const r = await getFocusAssignment({ courseCode, n }).catch(() => null);
    if (r) setFa(r);
  };

  const book: ReaderDoc | null = fb && {
    key: `book:${fb.chapterId}`,
    heading: fb.bookTitle,
    url: fb.url,
    page: fb.page,
    pages: fb.pages,
    options: fb.chapters.map((c) => ({ value: String(c.idx), label: c.title, done: c.done })),
    current: String(fb.idx),
    pickLabel: "פרק",
    onPick: openChapter,
    onSave: (p) => void savePlace(fb.chapterId, p).catch(() => {}),
    cta: { title: "לקרוא בזמן הזה", sub: `${fb.title}${fb.page > 1 ? `, מעמ׳ ${fb.page}` : ""}`, icon: "book" },
    kind: "book",
    chapterId: fb.chapterId,
    next: fb.chapters.some((c) => c.idx === fb.idx + 1) ? String(fb.idx + 1) : null,
  };
  const sheet = fa?.sheet ?? null;
  const assignment: ReaderDoc | null =
    fa && sheet
      ? {
          key: `assignment:${sheet.fileId}:${fa.n}`,
          heading: "מטלות הקורס",
          url: sheet.url,
          page: sheet.page,
          // online ones open on Opal, so the picker lists the ones with a sheet
          options: fa.options.filter((o) => !o.online).map((o) => ({ value: o.n, label: o.label })),
          current: fa.n,
          pickLabel: "מטלה",
          onPick: openAssignment,
          onSave: (p) => void saveAssignmentPlace(sheet.fileId, p).catch(() => {}),
          cta: { title: `לעבוד על ${fa.label}`, sub: sheet.page > 1 ? `דף המטלה, מעמ׳ ${sheet.page}` : "דף המטלה בתוך הטיימר", icon: "pencil" },
          kind: "assignment",
        }
      : null;
  const link = fa?.link ? { title: `${fa.label} באופל`, sub: "מטלה מקוונת: נפתחת בלשונית חדשה", url: fa.link } : null;
  return { book, assignment, link, prefer: want.preferAssignment || want.assignment ? "assignment" : "book", ready };
}

/**
 * The file inside the focus timer: a bar with the picker, the page, fit and zoom, and the pages
 * below (scrolling inside the timer's own box). A book chapter ends with "finished the chapter".
 */
export function FocusReader({
  doc,
  scrollRoot,
  wide,
}: {
  doc: ReaderDoc;
  /** the timer's scrolling box (the pages watch it, not the window) */
  scrollRoot: HTMLElement | null;
  /** computer: fit and zoom controls, and arrow keys for pages */
  wide: boolean;
}) {
  const [page, setPage] = useState(doc.page);
  const [pages, setPages] = useState(doc.pages ?? 0);
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
  useReaderKeys({ page, pages, jump: (p) => jump.current(p), zoom: view.zoom, setZoom: (zoom) => setView({ zoom }), inDialog: true });

  return (
    <div>
      <div ref={bar} className="sticky top-0 z-[5] flex items-center gap-3 border-b border-rule bg-bg/95 px-4 py-2 backdrop-blur lg:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-ink-soft">{doc.heading}</p>
          <select value={doc.current} onChange={(e) => doc.onPick(e.target.value)} className="w-full truncate bg-transparent font-medium focus:outline-none" aria-label={doc.pickLabel}>
            {doc.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.done ? "✓ " : ""}
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {pages > 0 && (
          <span className="shrink-0 text-sm tabular-nums text-ink-soft" aria-live="polite">
            עמ׳ {page} מתוך {pages}
          </span>
        )}
        {wide && <FitControls fit={view.fit} zoom={view.zoom} onChange={setView} />}
      </div>

      <div className="px-4 py-4 lg:px-6">
        <Pages
          key={doc.key}
          url={doc.url}
          chapterId={doc.chapterId ?? ""}
          initialPage={doc.page}
          zoom={wide ? view.zoom : 1}
          fit={wide ? view.fit : "width"}
          scrollRoot={scrollRoot}
          topOffset={barH}
          onPage={setPage}
          onPages={setPages}
          onSave={doc.onSave}
          jumpRef={jump}
        />
        {doc.kind === "book" && doc.chapterId && <ChapterEnd key={doc.chapterId} chapterId={doc.chapterId} next={doc.next ?? null} onNext={doc.onPick} />}
      </div>
    </div>
  );
}

function ChapterEnd({ chapterId, next, onNext }: { chapterId: string; next: string | null; onNext: (v: string) => void }) {
  const [done, setDone] = useState(false);
  return (
    <div className="mx-auto mt-6 flex max-w-xl flex-wrap items-center justify-center gap-3 pb-6">
      <button
        type="button"
        onClick={async () => {
          const v = !done;
          setDone(v);
          try {
            await markChapterDone(chapterId, v);
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
        <button type="button" onClick={() => onNext(next)} className="inline-flex items-center gap-1 rounded-full border border-rule px-4 py-2.5 hover:border-ink">
          לפרק הבא
          <Icon name="chevronLeft" className="size-4" />
        </button>
      )}
    </div>
  );
}
