-- Repeating events: one row per date sharing series_id, with the rule in repeat
-- ({freq: daily|weekdays|weekly|monthly, every?, days?, until}). Applied 20.10.2026.
alter table public.user_events add column if not exists series_id uuid, add column if not exists repeat jsonb;
create index if not exists user_events_series_idx on public.user_events (series_id) where series_id is not null;
