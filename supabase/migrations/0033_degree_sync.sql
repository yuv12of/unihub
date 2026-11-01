-- 0033 degree plan, round two (src/lib/degree.ts, sheilta.ts, registration.ts):
--  * scenarios: what-if versions of the plan [{id, name, plan}] next to the main one;
--  * sheilta: the last Sheilta snapshot {syncedAt, records[]} (courses, statuses, grades);
--  * degree_feed(token): plan + snapshot for the push tick (registration reminders), like automation_feed.
-- Idempotent.

alter table public.degree_plans add column if not exists scenarios jsonb not null default '[]'::jsonb;
alter table public.degree_plans add column if not exists sheilta jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'degree_plans_scenarios_check') then
    alter table public.degree_plans add constraint degree_plans_scenarios_check
      check (jsonb_typeof(scenarios) = 'array' and pg_column_size(scenarios) < 120000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'degree_plans_sheilta_check') then
    alter table public.degree_plans add constraint degree_plans_sheilta_check
      check (sheilta is null or (jsonb_typeof(sheilta) = 'object' and pg_column_size(sheilta) < 64000));
  end if;
end $$;

create or replace function public.degree_feed(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;
  select t.user_id into uid from public.ingest_tokens t where t.token = p_token;
  if uid is null then
    return null;
  end if;
  return (select jsonb_build_object('plan', d.plan, 'sheilta', d.sheilta) from public.degree_plans d where d.user_id = uid);
end;
$$;
revoke execute on function public.degree_feed(text) from public;
grant execute on function public.degree_feed(text) to anon, authenticated;
