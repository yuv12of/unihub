import Link from "next/link";
import { Icon } from "@/components/Icon";
import { MathText } from "@/components/MathText";
import type { ReadLink } from "@/lib/readings";

/** Chapters to read as small links; finished ones are ticked. Books not imported show as plain text. */
export function ReadChips({ links, className = "" }: { links: ReadLink[]; className?: string }) {
  if (!links.length) return null;
  return (
    <span className={`flex flex-wrap gap-1.5 ${className}`}>
      {links.map((l, i) =>
        l.href ? (
          <Link
            key={i}
            href={l.href}
            className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs hover:border-ink ${l.done ? "border-rule text-ink-soft" : "border-rule"}`}
          >
            <Icon name={l.done ? "check" : "book"} className="size-3 shrink-0" />
            <span className="truncate"><MathText text={l.title} /></span>
            {l.note && <span className="shrink-0 text-ink-soft">· <MathText text={l.note} /></span>}
          </Link>
        ) : (
          <span key={i} className="inline-flex items-center rounded-full border border-dashed border-rule px-2.5 py-0.5 text-xs text-ink-soft">
            {l.title}
          </span>
        ),
      )}
    </span>
  );
}
