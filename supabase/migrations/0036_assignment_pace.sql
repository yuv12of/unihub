-- The timeline of an assignment: how many of its parts had answers, each time that changed
-- (a tick, an untick, or new headings found in the solution). Read by the "ready to submit" panel
-- and by the pace warning push.
create table if not exists public.assignment_pace (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_code text not null,
  semester text not null,
  n text not null,
  at timestamptz not null default now(),
  answered int not null check (answered >= 0),
  total int not null check (total >= 0)
);
create index if not exists assignment_pace_lookup on public.assignment_pace (user_id, course_code, semester, n, at);
alter table public.assignment_pace enable row level security;
create policy "own pace" on public.assignment_pace for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
