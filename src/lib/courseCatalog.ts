/**
 * Reads a course's official requirements page (public, no login):
 * academic.openu.ac.il/course-requirements/course/<code>/semester/<semester>
 */
import type { AssignmentType } from "@/lib/semester";

export interface CatalogCourse {
  code: string;
  semester: string;
  name: string;
  coordinator: string | null;
  final_assessment: string | null;
  min_weight: number | null;
  max_weight: number | null;
  assignments: { n: string; type: AssignmentType; weight: number; due: string }[];
}

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

function typeOf(label: string): AssignmentType {
  if (/מקוונ/.test(label)) return "online";
  if (/השתתפות|נוכחות/.test(label)) return "participation";
  return "file";
}

export function requirementsUrl(code: string, semester: string) {
  return `https://academic.openu.ac.il/course-requirements/course/${code}/semester/${encodeURIComponent(semester)}`;
}

export function parseRequirements(html: string, code: string, semester: string): CatalogCourse | null {
  const main = html.slice(html.indexOf("<main"), html.lastIndexOf("</main>") + 7);
  const h2 = main.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? "";
  const name = decode(h2.replace(/<span[^>]*>\s*\d{5}\s*<\/span>/, ""));
  if (!name) return null;
  const field = (label: string) => {
    const m = main.match(new RegExp(`<p>\\s*${label}\\s*</p>\\s*<p>([\\s\\S]*?)</p>`));
    return m ? decode(m[1]) || null : null;
  };
  const assignments: CatalogCourse["assignments"] = [];
  const tbody = main.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
  for (const row of tbody.split(/<\/tr>/)) {
    const n = row.match(/<th[^>]*>([\s\S]*?)<\/th>/)?.[1];
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => decode(m[1]));
    if (!n || tds.length < 2) continue;
    const date = tds.find((t) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t));
    if (!date) continue;
    const [d, mo, y] = date.split("/");
    assignments.push({
      n: decode(n).padStart(2, "0"),
      type: typeOf(tds[0]),
      weight: Number(tds[1]) || 0,
      due: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`,
    });
  }
  const text = decode(main);
  const min = text.match(/מטלות במשקל (\d+) לפחות/)?.[1];
  const max = text.match(/מקסימום של (\d+)/)?.[1];
  return {
    code,
    semester,
    name,
    coordinator: field("מרכז הוראה"),
    final_assessment: field("מתכונת הערכה מסכמת"),
    min_weight: min ? Number(min) : assignments.length ? 0 : null,
    max_weight: max ? Number(max) : min ? Number(min) : null,
    assignments,
  };
}

export async function fetchRequirements(code: string, semester: string): Promise<CatalogCourse | null> {
  const res = await fetch(requirementsUrl(code, semester), {
    headers: { "User-Agent": "Mozilla/5.0 (Unihub course import)", "Accept-Language": "he" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return parseRequirements(await res.text(), code, semester);
}
