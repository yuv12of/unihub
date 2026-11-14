-- Applied 14.11.2026. Words next to the numbers: a description per goal, a note per milestone and task,
-- and goal_notes = a short dated progress journal the user writes for themselves.
alter table public.goals add column if not exists description text;
alter table public.goal_milestones add column if not exists note text;
alter table public.tasks add column if not exists note text;
create table if not exists public.goal_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  goal_id uuid not null references public.goals on delete cascade,
  date date not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists goal_notes_goal on public.goal_notes (goal_id, date);
create index if not exists goal_notes_user on public.goal_notes (user_id);
alter table public.goal_notes enable row level security;
create policy "own goal notes" on public.goal_notes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
