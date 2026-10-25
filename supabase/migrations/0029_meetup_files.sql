-- 0029 meetup files: after each meetup, the user's own notes (Notability PDF), the tutor's slides and
-- the recording link, kept with that meetup. Files live in the private bucket 'meetup-files' under
-- <uid>/<course>/<date>/…; the site signs upload and download links with the secret key after
-- checking the row here (RLS: own rows only). Idempotent.

create table if not exists public.meetup_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_code text not null check (course_code ~ '^\d{5}$'),
  date date not null,
  -- notes = my notes; slides = the tutor's files; recording = a link; other
  kind text not null check (kind in ('notes', 'slides', 'recording', 'other')),
  name text not null check (length(name) between 1 and 200),
  -- a stored file (path) or a link (url), never both
  path text,
  url text check (url is null or url ~ '^https://'),
  size bigint,
  created_at timestamptz not null default now(),
  check ((path is null) <> (url is null))
);
create index if not exists meetup_files_by_meetup on public.meetup_files (user_id, course_code, date);
alter table public.meetup_files enable row level security;

-- "No files for this one": stops the reminder card.
alter table public.meetup_notes add column if not exists files_done boolean not null default false;

insert into storage.buckets (id, name, public, file_size_limit)
values ('meetup-files', 'meetup-files', false, 52428800)
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'meetup_files' and policyname = 'own meetup files') then
    create policy "own meetup files" on public.meetup_files for all to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end $$;
