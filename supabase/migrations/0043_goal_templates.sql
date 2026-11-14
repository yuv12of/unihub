-- Applied 14.11.2026. The user's own goal templates: a goal's shape (how it is measured, milestones
-- with their steps, tasks, dates as offsets from the start) saved to start the same kind of goal again.
create table if not exists public.goal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists goal_templates_user on public.goal_templates (user_id);
alter table public.goal_templates enable row level security;
create policy "own goal templates" on public.goal_templates for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
