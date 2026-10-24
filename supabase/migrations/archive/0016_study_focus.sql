-- Open "stuck" points per course, where the planner reads them (kept by addStuck/resolveStuck). Applied 21.10.2026.
alter table public.study_prefs add column if not exists focus jsonb not null default '{}'::jsonb;
