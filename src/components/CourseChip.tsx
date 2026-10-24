/**
 * A course as a small label: its colour dot and short name. One component everywhere a course is
 * named in tight space (filters, month cells, chips), so long names never get truncated mid-word.
 * Inside a <button className="chip"> it becomes a filter chip.
 */
export function CourseChip({ short, color, className = "", title }: { short: string; color: string; className?: string; title?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`} title={title}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="truncate">{short}</span>
    </span>
  );
}
