"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { saveAssignmentPlace } from "@/app/act";
import { AssignmentQuestions, type TrackedAssignment } from "@/components/AssignmentQuestions";
import { FitControls, Pages, useReaderKeys, useReaderView } from "@/components/BookReader";
import { FOCUS_EVENT, useMinWidth } from "@/components/focusShared";
import { Icon } from "@/components/Icon";

/**
 * One assignment's question sheet in the same reader as the books: the pages large, and beside
 * them where I am question by question (tabs on a phone). Opens at the page I stopped at.
 */
export function AssignmentReader({
  course,
  assignment,
  file,
  others,
  tracked,
}: {
  course: { code: string; name: string; color: string };
  assignment: { n: string; label: string; dueLabel: string | null; daysLeft: number | null };
  file: { id: string; name: string; url: string; page: number; booklet: boolean };
  /** the course's assignments that have a sheet, to switch between them */
  others: { n: string; label: string }[];
  /** the question tracker (file assignments only) */
  tracked: TrackedAssignment | null;
}) {
  const router = useRouter();
  const [side, setSide] = useState<"read" | "track">("read");
  const [page, setPage] = useState(file.page);
  const [pages, setPages] = useState(0);
  const [view, setView] = useReaderView();
  const roomy = useMinWidth(640);
  const wide = useMinWidth(1024);
  const jump = useRef<(p: number) => void>(() => {});
  useReaderKeys({ page, pages, jump: (p) => jump.current(p), zoom: view.zoom, setZoom: (zoom) => setView({ zoom }) });
  const showTrack = !!tracked && view.panel;
  const due = assignment.daysLeft == null ? null : assignment.daysLeft < 0 ? "ההגשה עברה" : assignment.daysLeft === 0 ? "להגשה היום" : `${assignment.daysLeft} ימים להגשה`;

  return (
    <div data-wide>
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.4rem)] z-[5] -mx-4 mb-4 border-b border-rule bg-bg/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8 lg:py-3">
        <div className="flex items-center gap-2">
          <Link href={`/courses/${course.code}#assignments`} className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface hover:text-ink" aria-label="למטלות הקורס">
            <Icon name="chevronRight" className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-ink-soft">
              <span className="me-1.5 inline-block size-2 rounded-full align-middle" style={{ background: course.color }} aria-hidden />
              {course.name}
              {assignment.dueLabel ? ` · הגשה ${assignment.dueLabel}${due ? `, ${due}` : ""}` : ""}
            </p>
            {others.length > 1 ? (
              <select value={assignment.n} onChange={(e) => router.push(`/courses/${course.code}/assignment/${e.target.value}`)} className="w-full truncate bg-transparent font-medium focus:outline-none" aria-label="מטלה">
                {others.map((o) => (
                  <option key={o.n} value={o.n}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <h1 className="truncate font-medium">{assignment.label}</h1>
            )}
          </div>
          {pages > 0 && (
            <span className="shrink-0 text-sm tabular-nums text-ink-soft" aria-live="polite">
              {page}/{pages}
            </span>
          )}
          <div className="hidden sm:flex">
            <FitControls fit={view.fit} zoom={view.zoom} onChange={setView} />
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: { course: course.code, assignment: assignment.n } }))}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rule-strong px-3 py-1.5 text-sm hover:border-ink"
            aria-label="לעבוד עם טיימר"
            title="לעבוד על המטלה עם טיימר ריכוז"
          >
            <Icon name="timer" className="size-4" />
            <span className="max-sm:hidden sm:max-lg:hidden lg:max-xl:hidden">לעבוד עם טיימר</span>
          </button>
          {tracked && (
            <button
              type="button"
              onClick={() => setView({ panel: !view.panel })}
              aria-pressed={view.panel}
              aria-label="מעקב שאלות"
              className="hidden shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink-soft hover:text-ink lg:inline-flex"
            >
              <Icon name="list" className="size-4" />
              <span className="hidden xl:inline">{view.panel ? "הסתרת המעקב" : "מעקב שאלות"}</span>
            </button>
          )}
        </div>
        {tracked && (
          <div className="mt-2 flex gap-1 lg:hidden" role="tablist">
            {(
              [
                ["read", "דף המטלה"],
                ["track", "איפה אני"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={side === k} onClick={() => setSide(k)} className={`flex-1 rounded-full py-1.5 text-sm ${side === k ? "bg-accent text-on-accent" : "text-ink-soft"}`}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`grid items-start gap-8 ${showTrack ? "lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]" : ""}`}>
        <div className={side === "read" ? "" : "hidden lg:block"}>
          {file.booklet && <p className="mb-3 text-sm text-ink-soft">חוברת המטלות של הקורס. {assignment.label} נמצא בתוכה.</p>}
          <Pages
            url={file.url}
            chapterId=""
            initialPage={file.page}
            zoom={roomy ? view.zoom : 1}
            fit={roomy ? view.fit : "width"}
            topOffset={wide ? 72 : roomy ? 160 : 0}
            onPage={setPage}
            onPages={setPages}
            onSave={(p) => void saveAssignmentPlace(file.id, p).catch(() => {})}
            jumpRef={jump}
          />
        </div>
        {tracked && (
          <aside className={`space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto ${side === "track" ? "" : "hidden lg:block"} ${showTrack ? "" : "lg:hidden"}`}>
            <section className="panel px-5 pb-2 pt-5">
              <h2 className="section-title">איפה אני ב{assignment.label}</h2>
              <p className="mt-1 text-sm text-ink-soft">שאלה אחר שאלה. יומיים לפני ההגשה מופיעה רשימת בדיקה.</p>
              <AssignmentQuestions code={course.code} color={course.color} items={[tracked]} editable />
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}
