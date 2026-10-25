-- 0026 focus tasks: a small to-do list inside the focus timer. Tasks belong to one focus session
-- (session_key: a planned session's key, or "free|<date>|<course>" for a free timer); undone tasks of
-- a course are offered again in its next focus session. Idempotent.

create table if not exists public.focus_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_key text not null check (length(session_key) <= 300),
  course_code text check (course_code is null or course_code ~ '^\d{5}$'),
  text text not null check (length(text) between 1 and 200),
  done boolean not null default false,
  done_at timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists focus_tasks_session on public.focus_tasks (user_id, session_key);
create index if not exists focus_tasks_open on public.focus_tasks (user_id, course_code) where not done;
alter table public.focus_tasks enable row level security;

create policy "own focus tasks" on public.focus_tasks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
