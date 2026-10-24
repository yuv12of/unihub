-- 0023 exam dates published: dates read from university mail wait here until the user accepts them.
-- Accepting upserts into exams (done by the app); nothing writes exams automatically. Idempotent.

create table if not exists public.exam_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_code text not null,
  semester text not null,
  moed text not null check (moed in ('א', 'ב', 'מיוחד')),
  date date not null,
  start_time text check (start_time is null or start_time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  mail_id uuid references public.mails (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, course_code, semester, moed, date)
);
create index if not exists exam_candidates_pending on public.exam_candidates (user_id) where status = 'pending';
alter table public.exam_candidates enable row level security;
drop policy if exists "own exam candidates" on public.exam_candidates;
create policy "own exam candidates" on public.exam_candidates for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- The mail ingest (Apps Script token) adds candidates through this; returns how many are new.
-- Only my courses of that semester, and only dates not already in exams.
create or replace function public.exam_candidates_add(p_token text, p_gmail_id text, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  mid uuid;
  r jsonb;
  n int := 0;
  k int;
begin
  if p_token is null or length(p_token) < 32 then
    return 0;
  end if;
  select t.user_id into uid from public.ingest_tokens t where t.token = p_token;
  if uid is null then
    return 0;
  end if;
  select m.id into mid from public.mails m where m.user_id = uid and m.gmail_id = p_gmail_id;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if not exists (select 1 from public.user_courses c where c.user_id = uid and c.course_code = r->>'course_code' and c.semester = r->>'semester') then
      continue;
    end if;
    if exists (select 1 from public.exams e where e.user_id = uid and e.course_code = r->>'course_code' and e.semester = r->>'semester'
               and e.date = (r->>'date')::date) then
      continue;
    end if;
    insert into public.exam_candidates (user_id, course_code, semester, moed, date, start_time, mail_id)
    values (uid, r->>'course_code', r->>'semester', r->>'moed', (r->>'date')::date, nullif(r->>'start_time', ''), mid)
    on conflict (user_id, course_code, semester, moed, date) do nothing;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end;
$$;
revoke execute on function public.exam_candidates_add(text, text, jsonb) from public;
grant execute on function public.exam_candidates_add(text, text, jsonb) to anon, authenticated;
