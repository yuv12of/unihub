-- 0032 degree plans: the whole degree, course by semester (src/lib/degree.ts). One row per user;
-- plan = { program, items [{code, sem, credited?, passed?, grade?}], recognized [...], settings {...} }.
-- Checked and cleaned in the app (cleanPlan). Idempotent.

create table if not exists public.degree_plans (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  plan jsonb not null,
  updated_at timestamptz not null default now(),
  constraint degree_plans_size check (pg_column_size(plan) < 32000)
);
alter table public.degree_plans enable row level security;

drop policy if exists "own degree plan" on public.degree_plans;
create policy "own degree plan" on public.degree_plans for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
