-- Personal events (tutorials, own blocks), study-session status, and the university mailbox.

create table if not exists public.user_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  date        date not null,
  start_time  text,
  end_time    text,
  title       text not null check (length(title) between 1 and 200),
  kind        text not null default 'custom' check (kind in ('custom', 'tutorial', 'other')),
  course_code text,
  location    text,
  source      text not null default 'manual' check (source in ('manual', 'sheilta', 'mail')),
  external_id text,
  created_at  timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index if not exists user_events_user_date on public.user_events (user_id, date);

create table if not exists public.session_status (
  user_id     uuid not null references auth.users (id) on delete cascade,
  session_key text not null,
  status      text not null check (status in ('done', 'skipped')),
  updated_at  timestamptz not null default now(),
  primary key (user_id, session_key)
);

alter table public.exams add column if not exists source text not null default 'manual';

-- Token that lets the user's Google Apps Script deliver university mail (write-only).
create table if not exists public.ingest_tokens (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  token      text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists public.mails (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  gmail_id     text not null,
  thread_id    text,
  sender       text,
  subject      text,
  received_at  timestamptz not null,
  body_text    text,
  summary      text,
  category     text,
  action_items jsonb,
  processed_at timestamptz,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (user_id, gmail_id)
);
create index if not exists mails_user_received on public.mails (user_id, received_at desc);

create table if not exists public.mail_attachments (
  id          uuid primary key default gen_random_uuid(),
  mail_id     uuid not null references public.mails (id) on delete cascade,
  filename    text,
  mime_type   text,
  size_bytes  integer,
  data_base64 text,
  unique (mail_id, filename)
);

alter table public.user_events enable row level security;
alter table public.session_status enable row level security;
alter table public.ingest_tokens enable row level security;
alter table public.mails enable row level security;
alter table public.mail_attachments enable row level security;

create policy "own events" on public.user_events for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own session status" on public.session_status for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own ingest token" on public.ingest_tokens for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own mails" on public.mails for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own mail attachments" on public.mail_attachments for select to authenticated
  using (exists (select 1 from public.mails m where m.id = mail_id and m.user_id = (select auth.uid())));

-- Apps Script delivers mail through this function; the token identifies the user.
create or replace function public.ingest_mail(p_token text, p_mail jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  mid uuid;
  att jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'bad token';
  end if;
  select t.user_id into uid from public.ingest_tokens t where t.token = p_token;
  if uid is null then
    raise exception 'bad token';
  end if;
  if coalesce(p_mail->>'sender', '') !~* 'openu\.ac\.il' then
    return 'ignored';  -- only university mail is accepted
  end if;

  insert into public.mails (user_id, gmail_id, thread_id, sender, subject, received_at, body_text)
  values (uid, p_mail->>'id', p_mail->>'threadId', p_mail->>'sender', left(p_mail->>'subject', 500),
          (p_mail->>'date')::timestamptz, left(p_mail->>'body', 200000))
  on conflict (user_id, gmail_id) do nothing
  returning id into mid;
  if mid is null then
    return 'exists';
  end if;

  for att in select * from jsonb_array_elements(coalesce(p_mail->'attachments', '[]'::jsonb)) loop
    if coalesce((att->>'size')::int, 0) <= 4000000 then
      insert into public.mail_attachments (mail_id, filename, mime_type, size_bytes, data_base64)
      values (mid, left(att->>'name', 200), att->>'type', (att->>'size')::int, att->>'data')
      on conflict do nothing;
    end if;
  end loop;
  return 'stored';
end;
$$;
revoke all on function public.ingest_mail(text, jsonb) from public;
-- Intentionally callable without login: gated by the 192-bit token, accepts only openu.ac.il mail.
grant execute on function public.ingest_mail(text, jsonb) to anon;

-- Calendar feed now also carries personal events and session statuses.
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
                       from public.exams e where e.user_id = uid), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(v) - 'user_id') from public.user_events v
                        where v.user_id = uid and v.date >= current_date - 60), '[]'::jsonb),
    'session_status', coalesce((select jsonb_object_agg(s.session_key, s.status) from public.session_status s
                                where s.user_id = uid), '{}'::jsonb)
  );
end;
$$;
revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon;
