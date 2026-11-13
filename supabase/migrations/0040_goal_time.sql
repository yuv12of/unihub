-- Applied 13.11.2026 (together with 0039_goals.sql, which also got indexes goals_routine, goal_milestones_user, goal_logs_user).
-- Time on a goal: goal_logs rows with minutes (routine_date set when the row came from ticking the goal's routine).
alter table public.goal_logs add column if not exists routine_date date;

-- Focus minutes per day (time logged on goals + hobby practice) of me or of someone I follow who shares hours.
-- 'study' says whether that user has student mode on, so each league only lists its own kind.
create or replace function public.focus_minutes(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare p public.profiles; allowed boolean;
begin
  select * into p from public.profiles where id = p_user and status = 'approved';
  if p.id is null or not public.is_approved() then return null; end if;
  allowed := p_user = auth.uid() or exists (select 1 from public.follows where follower = auth.uid() and followee = p_user and status = 'accepted');
  if not allowed then return null; end if;
  return jsonb_build_object(
    'study', case when p.prefs->'modules'->>'study' = 'false' then false else true end,
    'days', case when p_user = auth.uid() or p.share->>'study' = 'true' then (
        select coalesce(jsonb_object_agg(d, m), '{}'::jsonb) from (
          select x.date::text as d, sum(x.minutes)::int as m from (
            select gl.date, gl.minutes from public.goal_logs gl where gl.user_id = p_user and gl.minutes is not null and gl.date >= current_date - 140
            union all
            select hl.date, hl.minutes from public.hobby_logs hl where hl.user_id = p_user and hl.date >= current_date - 140
          ) x group by x.date
        ) y)
      else '{}'::jsonb end
  );
end $$;
revoke all on function public.focus_minutes(uuid) from public;
revoke all on function public.focus_minutes(uuid) from anon;
grant execute on function public.focus_minutes(uuid) to authenticated;
