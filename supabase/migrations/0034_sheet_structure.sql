-- The questions and parts of an assignment sheet, read from the PDF's text once (lazily, on the
-- first "ready to submit" check): {"questions":[{"q":1,"points":25,"parts":[{"label":"א","subs":[]}]}]}.
-- {"questions":[]} marks "read, nothing found" (a scanned sheet) so it isn't read again.
alter table public.assignment_files add column if not exists structure jsonb;
