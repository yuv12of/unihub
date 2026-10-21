-- One-off changes to routine occurrences, and the weekly study goal where the planner reads it.
-- Applied 21.10.2026. (profiles.weekly_goal_minutes is copied to study_prefs by saveProfile.)
alter table public.routines add column if not exists overrides jsonb not null default '{}'::jsonb;
alter table public.study_prefs add column if not exists weekly_goal_minutes integer;
update public.study_prefs s set weekly_goal_minutes = p.weekly_goal_minutes from public.profiles p where p.id = s.user_id;
