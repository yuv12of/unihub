-- Applied 20.10.2026 as 0022_course_readings. Course plan: recommended weekly reading and each
-- assignment's material, from the course sites (Opal). refs resolve against each user's own books.
create table if not exists public.course_readings (
  course_code text not null,
  semester text not null,
  kind text not null check (kind in ('week','assignment')),
  ref text not null,
  starts date,
  label text not null,
  refs jsonb not null default '[]'::jsonb,
  estimated boolean not null default false,
  source text,
  primary key (course_code, semester, kind, ref)
);
alter table public.course_readings enable row level security;
create policy "readings readable" on public.course_readings for select to authenticated using (true);
