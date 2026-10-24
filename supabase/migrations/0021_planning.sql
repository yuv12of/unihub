-- Planning: exam runway (which מועד), past-exam bank with timed mock exams,
-- per-question tracking of file assignments (ממ"ן) and the pre-submission checklist.
-- Idempotent: safe to run more than once.

-- 1. Exam runway --------------------------------------------------------------
-- chosen: the מועד the user plans to take (true on one row per course; null = not chosen yet,
--         the planner then uses the earliest upcoming מועד, i.e. א).
-- mocks:  plan a timed "בחינה לדוגמה" once a week in the last three weeks before the chosen מועד.
alter table public.exams add column if not exists chosen boolean;
alter table public.exams add column if not exists mocks boolean not null default true;

-- The feed (calendar, push reminders) builds the same plan, so it needs the choice too.
-- Same as the live definition (0009) with 'chosen' and 'mocks' added to the exams entries.
create or replace function public._feed_for(uid uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select jsonb_build_object(
    'prefs', (select to_jsonb(p) - 'user_id' from public.study_prefs p where p.user_id = uid),
    'courses', public._courses_for(uid),
    'progress', coalesce((select jsonb_agg(jsonb_build_object('course_code', a.course_code, 'semester', a.semester, 'n', a.n, 'status', a.status, 'grade', a.grade, 'due_override', a.due_override))
                          from public.assignment_progress a where a.user_id = uid), '[]'::jsonb),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('course_code', e.course_code, 'semester', e.semester, 'moed', e.moed, 'date', e.date, 'start_time', e.start_time, 'chosen', e.chosen, 'mocks', e.mocks))
                       from public.exams e where e.user_id = uid), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(v) - 'user_id') from (
                          select * from public.user_events where user_id = uid and date >= current_date - 60
                          union all
                          select e.* from public.user_events e join public.event_invites i on i.event_id = e.id
                          where i.invitee = uid and i.status = 'accepted' and e.date >= current_date - 60) v), '[]'::jsonb),
    'session_status', coalesce((select jsonb_object_agg(s.session_key, s.status) from public.session_status s where s.user_id = uid), '{}'::jsonb),
    'session_minutes', coalesce((select jsonb_object_agg(s.session_key, s.minutes) from public.session_status s
                                where s.user_id = uid and s.status = 'done' and s.minutes is not null), '{}'::jsonb),
    'routines', coalesce((select jsonb_agg(to_jsonb(r)) from public.routines r
                          where r.active and (r.user_id = uid or exists (select 1 from public.routine_members m where m.routine_id = r.id and m.user_id = uid and m.status = 'accepted'))), '[]'::jsonb),
    'routine_logs', coalesce((select jsonb_agg(jsonb_build_object('routine_id', l.routine_id, 'date', l.date)) from public.routine_logs l
                              where l.user_id = uid and l.date >= current_date - 120), '[]'::jsonb),
    'off_days', coalesce((select jsonb_agg(d.date) from public.day_off d where d.user_id = uid and d.date >= current_date - 120), '[]'::jsonb),
    'updates_pending', (select count(*) from public.updates u where u.user_id = uid and u.status = 'pending'),
    'accounts_pending', case when (select is_admin from public.profiles where id = uid) then (select count(*) from public.profiles where status = 'pending') else 0 end
  );
$function$;

-- 2. Past-exam bank and mock attempts ----------------------------------------
create table if not exists public.past_exams (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  course_code      text not null,
  label            text not null check (length(label) between 1 and 120),  -- "2025ב מועד 83"
  url              text check (url is null or url ~ '^https?://'),
  duration_minutes integer not null default 180 check (duration_minutes between 15 and 600),
  questions        integer not null default 0 check (questions between 0 and 30),
  created_at       timestamptz not null default now()
);
create index if not exists past_exams_user_course on public.past_exams (user_id, course_code);

-- scores: [{"q": 1, "score": 80, "minutes": 34}, ...]  (score = percent of the question, self-graded)
create table if not exists public.mock_attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  exam_id     uuid not null references public.past_exams (id) on delete cascade,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  scores      jsonb not null default '[]'::jsonb
);
create index if not exists mock_attempts_user_exam on public.mock_attempts (user_id, exam_id);

-- 3. ממ"ן questions and the submission checklist -----------------------------
create table if not exists public.assignment_questions (
  user_id     uuid not null references auth.users (id) on delete cascade,
  course_code text not null,
  semester    text not null,
  n           text not null,
  q           integer not null check (q between 1 and 30),
  status      text not null default 'todo' check (status in ('todo', 'doing', 'done', 'stuck')),
  updated_at  timestamptz not null default now(),
  primary key (user_id, course_code, semester, n, q)
);

-- checks: ids of ticked checklist items ("export", "scan", "parts", "submit", "mail")
create table if not exists public.assignment_checks (
  user_id     uuid not null references auth.users (id) on delete cascade,
  course_code text not null,
  semester    text not null,
  n           text not null,
  checks      text[] not null default '{}',
  updated_at  timestamptz not null default now(),
  primary key (user_id, course_code, semester, n)
);

alter table public.past_exams enable row level security;
alter table public.mock_attempts enable row level security;
alter table public.assignment_questions enable row level security;
alter table public.assignment_checks enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'past_exams' and policyname = 'own past exams') then
    create policy "own past exams" on public.past_exams for all to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mock_attempts' and policyname = 'own mock attempts') then
    create policy "own mock attempts" on public.mock_attempts for all to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'assignment_questions' and policyname = 'own assignment questions') then
    create policy "own assignment questions" on public.assignment_questions for all to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'assignment_checks' and policyname = 'own assignment checks') then
    create policy "own assignment checks" on public.assignment_checks for all to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end $$;
