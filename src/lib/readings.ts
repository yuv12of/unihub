import { cache } from "react";
import { supabaseEnabled } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { semester } from "@/lib/semester";
import type { Book } from "@/lib/books";

/** One chapter to read, resolved against the user's own books. */
export interface ReadLink {
  title: string; // what to show: "פרק 3: מטריצות" or "פרק 6" for a chapter inside a book part
  note?: string; // "סעיפים 5.1–5.2"
  href: string | null; // null when the book isn't imported
  done: boolean;
}

export interface ReadingItem {
  kind: "week" | "assignment";
  ref: string; // week number or assignment number
  starts: string | null;
  label: string;
  estimated: boolean;
  links: ReadLink[];
}

interface Row {
  course_code: string;
  kind: "week" | "assignment";
  ref: string;
  starts: string | null;
  label: string;
  refs: { m: string; p?: number; note?: string }[];
  estimated: boolean;
}

/** The course plan rows (shared course info), cached per request. */
const getRows = cache(async (): Promise<Row[]> => {
  if (!supabaseEnabled) return [];
  const sb = await createClient();
  const { data } = await sb
    .from("course_readings")
    .select("course_code, kind, ref, starts, label, refs, estimated")
    .eq("semester", semester.semester);
  return (data ?? []) as Row[];
});

function resolve(row: Row, books: Book[]): ReadingItem {
  const mine = books.filter((b) => b.course_code === row.course_code).sort((a, b) => a.position - b.position);
  const links: ReadLink[] = [];
  const seen = new Set<string>();
  for (const r of row.refs) {
    let re: RegExp;
    try {
      re = new RegExp(r.m);
    } catch {
      continue;
    }
    // A pattern can match several sections (e.g. every "2.x" section of a unit): link each.
    const hits = mine.flatMap((b) => b.chapters.filter((c) => re.test(c.title)).map((c) => ({ b, c })));
    if (!hits.length) {
      links.push({ title: r.note ?? row.label, href: null, done: false });
      continue;
    }
    for (const { b, c } of hits) {
      const key = `${c.id}|${r.p ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Inside a book part, the note names the chapter ("פרק 6"); otherwise the chapter title says it.
      const inPart = r.p != null;
      links.push({
        title: inPart ? (r.note ?? c.title) : c.title,
        note: inPart ? undefined : r.note,
        href: `/books/${b.id}?ch=${c.idx}${r.p ? `&p=${r.p}` : ""}`,
        done: !!c.done_at,
      });
    }
  }
  return { kind: row.kind, ref: row.ref, starts: row.starts, label: row.label, estimated: row.estimated, links };
}

/** Week-by-week reading for each course, and the material of each assignment. */
export async function getReadings(books: Book[]) {
  const rows = await getRows();
  const weeks: Record<string, ReadingItem[]> = {};
  const assignments: Record<string, Record<string, ReadingItem>> = {};
  for (const row of rows) {
    const item = resolve(row, books);
    if (row.kind === "week") (weeks[row.course_code] ??= []).push(item);
    else (assignments[row.course_code] ??= {})[row.ref] = item;
  }
  for (const list of Object.values(weeks)) list.sort((a, b) => Number(a.ref) - Number(b.ref));
  return { weeks, assignments };
}

/** The week of a course plan that contains a date (or the first week, before the semester starts). */
export function weekFor(list: ReadingItem[] | undefined, date: string): ReadingItem | null {
  if (!list?.length) return null;
  let found: ReadingItem | null = null;
  for (const w of list) if (w.starts && w.starts <= date) found = w;
  return found ?? list[0];
}
