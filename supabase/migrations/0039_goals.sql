-- NOT APPLIED YET (written 13.11.2026). Goals board for everyone, students or not.
-- A goal has a finish line (a hobby doesn't). Progress comes from its tasks, its milestones,
-- a number (₪, km, kg) or a manual percent; goal_logs keeps the history the graphs draw.
-- tasks is the general to-do list: goal_id null = a plain task. repeat/source leave room for
-- moving routine to-dos here later.
-- Apply one statement group at a time (policies one per call, see docs/PLAN.md).
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  color text not null default 'blue',
  area text not null default 'personal',
  status text not null default 'active' check (status in ('idea', 'active', 'paused', 'done', 'dropped')),
  why text,
  started_on date not null default current_date,
  due date,
  progress_mode text not null default 'tasks' check (progress_mode in ('tasks', 'milestones', 'number', 'manual')),
  start_value numeric, target_value numeric, unit text,
  weekly_minutes int not null default 0,
  routine_id uuid references public.routines on delete set null,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create table if not exists public.goal_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  goal_id uuid not null references public.goals on delete cascade,
  title text not null, due date, done_at timestamptz, sort int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  goal_id uuid references public.goals on delete cascade,
  title text not null, due date, minutes int, done_at timestamptz, sort int not null default 0,
  repeat jsonb, source text not null default 'manual',
  created_at timestamptz not null default now()
);
create table if not exists public.goal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  goal_id uuid not null references public.goals on delete cascade,
  date date not null, value numeric, percent int, minutes int, note text,
  created_at timestamptz not null default now()
);
create index if not exists goals_user on public.goals (user_id, status);
create index if not exists goal_milestones_goal on public.goal_milestones (goal_id);
create index if not exists tasks_user on public.tasks (user_id, done_at);
create index if not exists tasks_goal on public.tasks (goal_id);
create index if not exists goal_logs_goal on public.goal_logs (goal_id, date);
alter table public.goals enable row level security;
alter table public.goal_milestones enable row level security;
alter table public.tasks enable row level security;
alter table public.goal_logs enable row level security;
create policy "own goals" on public.goals for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own goal milestones" on public.goal_milestones for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own tasks" on public.tasks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own goal logs" on public.goal_logs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
