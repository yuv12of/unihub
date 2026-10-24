-- Applied 23.10.2026 (review fixes). friend_view: with sharing "busy", events carry times only (no
-- titles/places), prefs without the Shabbat city / focus; catalog_add_course: existing courses are
-- refreshed only by an admin; trigger functions not callable by clients; vapid_private server-only;
-- claim_tick throttles the everyone-else part of /api/push/tick to once per 8 minutes.
-- (Full function bodies live in the database; see `select pg_get_functiondef('public.friend_view'::regproc)`.)
revoke execute on function public._on_follow(), public._on_invite(), public._on_join(), public._on_reaction(), public._on_routine_log(), public._on_routine_member(), public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.vapid_private(text) from public, anon, authenticated;
alter table public.app_keys add column if not exists tick_at timestamptz;
create or replace function public.claim_tick() returns boolean language sql security definer set search_path = '' as $$
  with u as (update public.app_keys set tick_at = now() where id = 1 and (tick_at is null or tick_at < now() - interval '8 minutes') returning 1)
  select exists (select 1 from u);
$$;
revoke execute on function public.claim_tick() from public, anon, authenticated;
