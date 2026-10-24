-- Semesters in one table: which one is current is a single row flag, read by current_semester()
-- (and mirrored in the app by SEMESTERS in src/lib/semester.ts).
-- Dates: Open University academic calendar, academic.openu.ac.il/yedion/timetable
-- (as recorded in src/data/academic-2027.json, page updated 04/10/2026):
--   2027א 25.10.2026–31.1.2027, 2027ב 7.3.2027–25.6.2027.
-- Switching semester later: update public.semesters set current = (code = '2027ב');
-- plus flip `current` in src/lib/semester.ts.
-- Idempotent; safe to run again.

create table if not exists public.semesters (
  code text primary key check (code ~ '^\d{4}[אבג]$'),
  starts date not null,
  ends date not null,
  current boolean not null default false,
  check (ends > starts)
);

-- At most one current semester.
create unique index if not exists semesters_one_current on public.semesters (current) where current;

alter table public.semesters enable row level security;

-- Shared reference data: anyone may read it, only the server (service role / SQL editor) writes.
drop policy if exists "semesters readable" on public.semesters;
create policy "semesters readable" on public.semesters as permissive for select to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.semesters from anon, authenticated;
grant select on public.semesters to anon, authenticated;
grant all on public.semesters to service_role;

insert into public.semesters (code, starts, ends, current) values
  ('2027א', '2026-10-25', '2027-01-31', true),
  ('2027ב', '2027-03-07', '2027-06-25', false)
on conflict (code) do update set starts = excluded.starts, ends = excluded.ends;

-- current_semester() reads the flag (fixed search_path, which the advisor asked for).
-- Falls back to '2027א' if the table is empty, so _courses_for / catalog_add_course keep working.
create or replace function public.current_semester()
  returns text
  language sql
  stable
  set search_path = ''
as $$
  select coalesce((select code from public.semesters where current limit 1), '2027א')
$$;
