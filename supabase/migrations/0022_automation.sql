-- 0022 automation: session agenda ticks, if-then fallback plans, overnight practice marking.
-- Idempotent: safe to run twice. The app treats every table here as empty until this is applied.

-- ---------- Session agenda: ticked steps of a planned study session ----------
create table if not exists public.session_steps (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_key text not null,          -- lib/planner sessionKey(): "2026-10-25|routine|20109|routine"
  step_id text not null,              -- lib/agenda step id: "read:<book>:<idx>", "video:<id>", "cards", "q:<n>:<k>", "questions:<chapter>"
  done_at timestamptz not null default now(),
  primary key (user_id, session_key, step_id)
);
alter table public.session_steps enable row level security;
drop policy if exists "own session steps" on public.session_steps;
create policy "own session steps" on public.session_steps for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------- If-then fallback plans ----------
create table if not exists public.if_then (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trigger_kind text not null check (trigger_kind in ('session_not_started', 'missed_day', 'routine_missed', 'behind_goal')),
  params jsonb not null default '{}'::jsonb, -- see lib/ifthen.ts IfThenParams
  action text not null check (length(action) between 1 and 200),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists if_then_user on public.if_then (user_id);
alter table public.if_then enable row level security;
drop policy if exists "own if-then plans" on public.if_then;
create policy "own if-then plans" on public.if_then for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------- Overnight practice marking (written by the 05:25 scheduled task) ----------
create table if not exists public.practice_marks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete cascade,
  page int not null default 1,
  course_code text,
  exercise text,                      -- "3.2" from a note named "תרגול 20109 3.2"
  verdict text check (verdict in ('correct', 'error', 'unclear')),
  first_wrong_line text,              -- the first line that goes wrong, quoted from the page
  feedback text not null,             -- a hint toward the fix, never the full solution
  created_at timestamptz not null default now(),
  seen boolean not null default false,
  unique (note_id, page)
);
create index if not exists practice_marks_user on public.practice_marks (user_id, created_at desc);
alter table public.practice_marks enable row level security;
drop policy if exists "own practice marks" on public.practice_marks;
create policy "own practice marks" on public.practice_marks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------- What the push tick needs beyond private_feed, through the Apps Script token ----------
-- (Other users are read with the secret key directly, so this is only for the caller.)
create or replace function public.automation_feed(p_token text)
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
  return jsonb_build_object(
    'if_then', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.trigger_kind, 'params', i.params, 'action', i.action, 'active', i.active))
                         from public.if_then i where i.user_id = uid and i.active), '[]'::jsonb),
    'live_started_at', (select l.started_at from public.study_live l where l.user_id = uid and l.ends_at > now() limit 1)
  );
end;
$$;
revoke execute on function public.automation_feed(text) from public;
grant execute on function public.automation_feed(text) to anon, authenticated;
