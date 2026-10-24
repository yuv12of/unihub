-- 0025 meetup mode: from 30 minutes before a tutorial until an hour after it, Today and /meetup/<code>/<date>
-- give the join link, the questions prepared for it, live notes, and a wrap-up. Idempotent.

-- Per user (groups differ): the Opal live room (Zoom redirect), the recordings page, "780-04 · tutor".
alter table public.user_courses add column if not exists live_url text check (live_url is null or live_url ~ '^https://');
alter table public.user_courses add column if not exists recordings_url text check (recordings_url is null or recordings_url ~ '^https://');
alter table public.user_courses add column if not exists group_label text check (group_label is null or length(group_label) <= 80);

-- One note per course meeting (course + date, so a resynced event keeps its notes).
create table if not exists public.meetup_notes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_code text not null,
  date date not null,
  body text not null default '' check (length(body) <= 20000),
  -- null = not answered yet; false = missed (the wrap-up offers the recording)
  attended boolean,
  -- stuck_points ids raised in this meetup (ticked in the questions list)
  asked uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, course_code, date)
);
alter table public.meetup_notes enable row level security;

create policy "own meetup notes" on public.meetup_notes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
