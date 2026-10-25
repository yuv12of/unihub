-- 0027 chapter conclusion ("סיכום הפרק"): written by the morning task next to summary/key_points.
-- Shape (lib/books.ts ChapterConclusion):
-- { "bottom_line": "one sentence",
--   "must_know": [{ "kind": "def"|"thm"|"method", "title": "...", "text": "...", "page": 12 }],
--   "pitfalls": ["..."],
--   "self_check": [{ "q": "...", "a": "..." }],
--   "next": "how it leads into the next chapter" | null }
alter table public.book_chapters add column if not exists conclusion jsonb;
