-- Applied 23.10.2026.
-- Course videos: shared, read-only for signed-in users (rows added by the owner / scheduled task).
create table if not exists public.course_videos (
  id bigserial primary key,
  course_code text not null,
  topic_sort int not null,
  topic text not null,
  m text,            -- regex on the user's book chapter titles, to link the chapter
  p int,             -- page inside that chapter
  sort int not null default 0,
  video_id text not null,
  title text not null,
  channel text not null,
  lang text not null default 'he',
  minutes int,
  unique (course_code, topic_sort, video_id)
);
alter table public.course_videos enable row level security;
create policy "read videos" on public.course_videos for select to authenticated using (true);

create table if not exists public.video_watched (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  video_id text not null,
  watched_at timestamptz not null default now(),
  primary key (user_id, video_id)
);
alter table public.video_watched enable row level security;
create policy "own watched" on public.video_watched for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Hobbies
create table if not exists public.hobbies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null, emoji text, kind text not null default 'other',
  weekly_minutes int not null default 0,
  routine_id uuid references public.routines on delete set null,
  why text, archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.hobby_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  hobby_id uuid not null references public.hobbies on delete cascade,
  title text not null, kind text not null default 'skill', status text not null default 'want',
  progress int not null default 0, note text, url text, sort int not null default 0,
  created_at timestamptz not null default now(), done_at timestamptz
);
create table if not exists public.hobby_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  hobby_id uuid not null references public.hobbies on delete cascade,
  item_id uuid references public.hobby_items on delete set null,
  date date not null, minutes int not null, note text, mood int,
  routine_date date,  -- set when the log came from ticking the hobby's routine
  created_at timestamptz not null default now()
);
create index if not exists hobby_logs_hobby on public.hobby_logs (hobby_id, date);
alter table public.hobbies enable row level security;
alter table public.hobby_items enable row level security;
alter table public.hobby_logs enable row level security;
create policy "own hobbies" on public.hobbies for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own hobby items" on public.hobby_items for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own hobby logs" on public.hobby_logs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
