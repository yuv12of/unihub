-- Applied 2026-10-17 (profile_customization was applied directly before this; see 0009 notes).
alter table public.study_prefs add column if not exists jewish jsonb;

alter table public.external_feeds drop constraint external_feeds_kind_check;
alter table public.external_feeds add constraint external_feeds_kind_check check (kind in ('opal', 'google'));
alter table public.external_feeds drop constraint external_feeds_url_check;
alter table public.external_feeds add constraint external_feeds_url_check check (
  (kind = 'opal' and url ~ '^https://opal\.openu\.ac\.il/calendar/export_execute\.php\?')
  or (kind = 'google' and url ~ '^https://calendar\.google\.com/calendar/ical/[^/?#]+/private-[0-9a-f]+/basic\.ics$')
);
alter table public.user_events drop constraint user_events_source_check;
alter table public.user_events add constraint user_events_source_check check (source in ('manual', 'sheilta', 'mail', 'opal', 'google'));

create table if not exists public.spotify_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  spotify_name text,
  updated_at timestamptz not null default now()
);
alter table public.spotify_tokens enable row level security;
create policy "own spotify" on public.spotify_tokens for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.spotify_tokens to authenticated;
