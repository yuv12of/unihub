-- 0024 end-of-day check: 20 seconds each evening (energy, what got in the way, when focus was best).
-- After enough evenings, study_prefs.rhythm holds the learned best time band and the courses that
-- are hardest to get through; the planner puts the hardest course into the best band. Idempotent.

create table if not exists public.day_checks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  energy smallint not null check (energy between 1 and 5),
  -- tired, phone, didnt_get, unexpected, mood, other_tasks, noise
  blockers text[] not null default '{}',
  -- when focus was best today: morning / midday / afternoon / evening (optional)
  focus_band text check (focus_band in ('morning', 'midday', 'afternoon', 'evening')),
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table public.day_checks enable row level security;

create policy "own day checks" on public.day_checks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Learned rhythm (lib/rhythm.ts Rhythm), recomputed on every check. Flows to the calendar feed and
-- push reminders through _feed_for (to_jsonb of the study_prefs row), so they plan the same way.
alter table public.study_prefs add column if not exists rhythm jsonb;
