-- Exams, study preferences and the private calendar feed.

-- Exam dates per user (entered by hand until they can be read from Opal).
create table if not exists public.exams (
  user_id     uuid not null references auth.users (id) on delete cascade,
  course_code text not null,
  semester    text not null,
  moed        text not null check (moed in ('א', 'ב', 'ג')),
  date        date not null,
  start_time  text,
  primary key (user_id, course_code, semester, moed),
  foreign key (course_code, semester) references public.courses (code, semester) on delete cascade
);

-- When the user can study. availability: {"0": {"start": "18:00", "minutes": 120}, ...}, 0 = Sunday.
create table if not exists public.study_prefs (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  availability     jsonb not null default '{
    "0": {"start": "18:00", "minutes": 120},
    "1": {"start": "18:00", "minutes": 120},
    "2": {"start": "18:00", "minutes": 120},
    "3": {"start": "18:00", "minutes": 120},
    "4": {"start": "18:00", "minutes": 120},
    "5": {"start": "10:00", "minutes": 120},
    "6": {"start": "20:00", "minutes": 0}
  }'::jsonb,
  session_minutes  integer not null default 90 check (session_minutes between 30 and 240),
  fill_routine     boolean not null default true,
  updated_at       timestamptz not null default now()
);

-- Secret token for the subscribable iCal feed (Google Calendar "From URL").
create table if not exists public.calendar_feeds (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  token      text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

alter table public.exams enable row level security;
alter table public.study_prefs enable row level security;
alter table public.calendar_feeds enable row level security;

create policy "users manage their own exams" on public.exams
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage their own study prefs" on public.study_prefs
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage their own feed" on public.calendar_feeds
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- The feed URL is fetched by Google's servers without a login, so it is resolved by token
-- through this narrow function instead of opening the tables to anonymous reads.
create or replace function public.calendar_feed(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;
  select f.user_id into uid from public.calendar_feeds f where f.token = p_token;
  if uid is null then
    return null;
  end if;
  return jsonb_build_object(
    'prefs', (select to_jsonb(p) - 'user_id' from public.study_prefs p where p.user_id = uid),
    'progress', coalesce((select jsonb_agg(jsonb_build_object('course_code', a.course_code, 'semester', a.semester, 'n', a.n, 'status', a.status))
                          from public.assignment_progress a where a.user_id = uid), '[]'::jsonb),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('course_code', e.course_code, 'semester', e.semester, 'moed', e.moed, 'date', e.date, 'start_time', e.start_time))
                       from public.exams e where e.user_id = uid), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.calendar_feed(text) from public;
-- Intentionally callable without login: access is gated by the 192-bit token.
grant execute on function public.calendar_feed(text) to anon;
