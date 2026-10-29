-- 0030 assignment files: the question sheet of each ממ"ן / ממ"ח (or the semester's whole booklet,
-- n = 'all'), uploaded once when the semester opens. Files live in the private bucket
-- 'assignment-files' under <uid>/<course>/<semester>/…; the site signs upload and download links
-- with the secret key after checking the row here (RLS: own rows only). Idempotent.

create table if not exists public.assignment_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_code text not null check (course_code ~ '^\d{5}$'),
  semester text not null,
  -- the assignment's number as the course lists it ("11"), or 'all' for a booklet with all of them
  n text not null check (n ~ '^(\d{1,3}|all)$'),
  name text not null check (length(name) between 1 and 200),
  path text not null,
  size bigint,
  -- where I stopped reading (page within the file)
  last_page integer check (last_page is null or last_page between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists assignment_files_by_course on public.assignment_files (user_id, course_code, semester, n);
alter table public.assignment_files enable row level security;

insert into storage.buckets (id, name, public, file_size_limit)
values ('assignment-files', 'assignment-files', false, 52428800)
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'assignment_files' and policyname = 'own assignment files') then
    create policy "own assignment files" on public.assignment_files for all to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end $$;
