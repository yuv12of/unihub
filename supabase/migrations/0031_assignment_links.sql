-- 0031 assignment links and submissions:
--  * assignment_files.kind: 'sheet' (the questions) or 'answer' (the file I submitted);
--  * a row is a stored file (path) or a link (url): an online ממ"ח keeps the link to its quiz;
--  * user_courses.assignments_url: the course's page with all its assignments (on Opal).
-- Idempotent.

alter table public.assignment_files add column if not exists kind text not null default 'sheet';
alter table public.assignment_files add column if not exists url text;
alter table public.assignment_files alter column path drop not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assignment_files_kind_check') then
    alter table public.assignment_files add constraint assignment_files_kind_check check (kind in ('sheet', 'answer'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assignment_files_url_check') then
    alter table public.assignment_files add constraint assignment_files_url_check check (url is null or (url ~ '^https://' and length(url) <= 1000));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assignment_files_path_or_url') then
    alter table public.assignment_files add constraint assignment_files_path_or_url check ((path is null) <> (url is null));
  end if;
end $$;

alter table public.user_courses add column if not exists assignments_url text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_courses_assignments_url_check') then
    alter table public.user_courses add constraint user_courses_assignments_url_check check (assignments_url is null or (assignments_url ~ '^https://' and length(assignments_url) <= 500));
  end if;
end $$;
