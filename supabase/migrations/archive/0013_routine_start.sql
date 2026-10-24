-- Routines can start on a set date (a routine planned for next week doesn't show this week).
-- Applied 20.10.2026.
alter table public.routines add column if not exists starts_on date;
