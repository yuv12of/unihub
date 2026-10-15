-- Unihub initial schema.
-- Run once in Supabase: Dashboard -> SQL Editor -> paste -> Run.

-- Courses and assignments: reference data synced from Opal / course-requirements pages.
create table if not exists public.courses (
  code            text not null,
  semester        text not null,
  name            text not null,
  name_en         text,
  opal_id         integer,
  coordinator     text,
  final_assessment text,
  min_weight      integer,
  max_weight      integer,
  rules           text[] default '{}',
  primary key (code, semester)
);

create table if not exists public.assignments (
  course_code text not null,
  semester    text not null,
  n           text not null,
  type        text not null check (type in ('file', 'online', 'participation')),
  weight      integer not null,
  due         date not null,
  primary key (course_code, semester, n),
  foreign key (course_code, semester) references public.courses (code, semester) on delete cascade
);

-- Per-user progress on each assignment.
create table if not exists public.assignment_progress (
  user_id     uuid not null references auth.users (id) on delete cascade,
  course_code text not null,
  semester    text not null,
  n           text not null,
  status      text not null default 'todo' check (status in ('todo', 'in_progress', 'submitted', 'skipped')),
  grade       integer check (grade between 0 and 100),
  updated_at  timestamptz not null default now(),
  primary key (user_id, course_code, semester, n),
  foreign key (course_code, semester, n) references public.assignments (course_code, semester, n) on delete cascade
);

alter table public.courses enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_progress enable row level security;

create policy "signed-in users read courses" on public.courses
  for select to authenticated using (true);
create policy "signed-in users read assignments" on public.assignments
  for select to authenticated using (true);
create policy "users manage their own progress" on public.assignment_progress
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
