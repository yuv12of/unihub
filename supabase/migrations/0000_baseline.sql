-- Unihub baseline: the whole public schema as it is live on 24.10.2026 (Supabase project
-- aajoigtmsvtzcehrnzvz), read from pg_catalog. Apply this on a FRESH Supabase project, then the
-- later numbered files in this folder in order. The old files are history in ./archive/.
--
-- Contents: extensions, 42 tables (columns, defaults, checks, keys), foreign keys, indexes,
-- 45 functions (full bodies), 7 triggers (one on auth.users), RLS on every table + every policy,
-- table/column/function grants, the private 'books' storage bucket and its policies.
-- No data: the app creates its rows itself (app_keys gets its single row, id = 1, from
-- vapid_init() the first time push is set up; profiles from the auth trigger).
-- Re-runnable: create ... if not exists / or replace, policies and triggers dropped first.

set check_function_bodies = off;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- ---------- Tables ----------
create sequence if not exists public.course_videos_id_seq;

create table if not exists public.app_keys (
  id integer default 1 not null,
  vapid_public text not null,
  vapid_private text not null,
  created_at timestamp with time zone default now() not null,
  tick_at timestamp with time zone,
  constraint app_keys_pkey PRIMARY KEY (id),
  constraint app_keys_id_check CHECK ((id = 1))
);

create table if not exists public.assignment_progress (
  user_id uuid not null,
  course_code text not null,
  semester text not null,
  n text not null,
  status text default 'todo'::text not null,
  grade integer,
  updated_at timestamp with time zone default now() not null,
  due_override date,
  constraint assignment_progress_pkey PRIMARY KEY (user_id, course_code, semester, n),
  constraint assignment_progress_grade_check CHECK (((grade >= 0) AND (grade <= 100))),
  constraint assignment_progress_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'submitted'::text, 'skipped'::text])))
);

create table if not exists public.assignment_reviews (
  user_id uuid default auth.uid() not null,
  course_code text not null,
  semester text not null,
  n text not null,
  minutes_spent integer,
  difficulty integer,
  hard text,
  created_at timestamp with time zone default now() not null,
  constraint assignment_reviews_pkey PRIMARY KEY (user_id, course_code, semester, n),
  constraint assignment_reviews_difficulty_check CHECK (((difficulty >= 1) AND (difficulty <= 5))),
  constraint assignment_reviews_hard_check CHECK ((length(hard) <= 500)),
  constraint assignment_reviews_minutes_spent_check CHECK (((minutes_spent >= 0) AND (minutes_spent <= 6000)))
);

create table if not exists public.assignments (
  course_code text not null,
  semester text not null,
  n text not null,
  type text not null,
  weight integer not null,
  due date not null,
  constraint assignments_pkey PRIMARY KEY (course_code, semester, n),
  constraint assignments_type_check CHECK ((type = ANY (ARRAY['file'::text, 'online'::text, 'participation'::text])))
);

create table if not exists public.book_chapters (
  id uuid default gen_random_uuid() not null,
  book_id uuid not null,
  user_id uuid not null,
  idx integer not null,
  title text not null,
  start_page integer not null,
  end_page integer not null,
  storage_path text not null,
  text_content text,
  summary text,
  key_points jsonb,
  processed_at timestamp with time zone,
  last_page integer,
  read_at timestamp with time zone,
  done_at timestamp with time zone,
  constraint book_chapters_book_id_idx_key UNIQUE (book_id, idx),
  constraint book_chapters_pkey PRIMARY KEY (id)
);

create table if not exists public.book_questions (
  id uuid default gen_random_uuid() not null,
  chapter_id uuid not null,
  user_id uuid not null,
  idx integer default 0 not null,
  prompt text not null,
  hint text,
  answer text not null,
  page integer,
  difficulty integer default 2 not null,
  status text,
  created_at timestamp with time zone default now() not null,
  constraint book_questions_pkey PRIMARY KEY (id),
  constraint book_questions_difficulty_check CHECK (((difficulty >= 1) AND (difficulty <= 3))),
  constraint book_questions_status_check CHECK ((status = ANY (ARRAY['solved'::text, 'stuck'::text, 'skipped'::text])))
);

create table if not exists public.books (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  course_code text not null,
  title text not null,
  source_path text,
  pages integer default 0 not null,
  "position" integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  constraint books_pkey PRIMARY KEY (id)
);

create table if not exists public.calendar_feeds (
  user_id uuid not null,
  token text default encode(extensions.gen_random_bytes(24), 'hex'::text) not null,
  created_at timestamp with time zone default now() not null,
  constraint calendar_feeds_token_key UNIQUE (token),
  constraint calendar_feeds_pkey PRIMARY KEY (user_id)
);

create table if not exists public.cards (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  course_code text not null,
  topic text,
  kind text default 'mcq'::text not null,
  front text not null,
  back text,
  options jsonb,
  answer_index integer,
  explanation text,
  source text,
  due_at timestamp with time zone default now() not null,
  interval_days real default 0 not null,
  ease real default 2.5 not null,
  reps integer default 0 not null,
  lapses integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  chapter_id uuid,
  page integer,
  constraint cards_pkey PRIMARY KEY (id),
  constraint cards_kind_check CHECK ((kind = ANY (ARRAY['mcq'::text, 'flash'::text])))
);

create table if not exists public.course_readings (
  course_code text not null,
  semester text not null,
  kind text not null,
  ref text not null,
  starts date,
  label text not null,
  refs jsonb default '[]'::jsonb not null,
  estimated boolean default false not null,
  source text,
  constraint course_readings_pkey PRIMARY KEY (course_code, semester, kind, ref),
  constraint course_readings_kind_check CHECK ((kind = ANY (ARRAY['week'::text, 'assignment'::text])))
);

create table if not exists public.course_videos (
  id bigint default nextval('public.course_videos_id_seq'::regclass) not null,
  course_code text not null,
  topic_sort integer not null,
  topic text not null,
  m text,
  p integer,
  sort integer default 0 not null,
  video_id text not null,
  title text not null,
  channel text not null,
  lang text default 'he'::text not null,
  minutes integer,
  constraint course_videos_course_code_topic_sort_video_id_key UNIQUE (course_code, topic_sort, video_id),
  constraint course_videos_pkey PRIMARY KEY (id)
);

create table if not exists public.courses (
  code text not null,
  semester text not null,
  name text not null,
  name_en text,
  opal_id integer,
  coordinator text,
  final_assessment text,
  min_weight integer,
  max_weight integer,
  rules text[] default '{}'::text[],
  constraint courses_pkey PRIMARY KEY (code, semester)
);

create table if not exists public.day_off (
  user_id uuid not null,
  date date not null,
  reason text default 'other'::text not null,
  constraint day_off_pkey PRIMARY KEY (user_id, date),
  constraint day_off_reason_check CHECK ((reason = ANY (ARRAY['sick'::text, 'reserve'::text, 'family'::text, 'other'::text])))
);

create table if not exists public.event_invites (
  event_id uuid not null,
  invitee uuid not null,
  inviter uuid not null,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now() not null,
  constraint event_invites_pkey PRIMARY KEY (event_id, invitee),
  constraint event_invites_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])))
);

create table if not exists public.exams (
  user_id uuid not null,
  course_code text not null,
  semester text not null,
  moed text not null,
  date date not null,
  start_time text,
  source text default 'manual'::text not null,
  constraint exams_pkey PRIMARY KEY (user_id, course_code, semester, moed),
  constraint exams_moed_check CHECK ((moed = ANY (ARRAY['א'::text, 'ב'::text, 'ג'::text])))
);

create table if not exists public.external_feeds (
  user_id uuid not null,
  kind text not null,
  url text not null,
  last_synced_at timestamp with time zone,
  last_status text,
  last_count integer,
  created_at timestamp with time zone default now() not null,
  constraint external_feeds_pkey PRIMARY KEY (user_id, kind),
  constraint external_feeds_kind_check CHECK ((kind = ANY (ARRAY['opal'::text, 'google'::text]))),
  constraint external_feeds_url_check CHECK ((((kind = 'opal'::text) AND (url ~ '^https://opal\.openu\.ac\.il/calendar/export_execute\.php\?'::text)) OR ((kind = 'google'::text) AND (url ~ '^https://calendar\.google\.com/calendar/ical/[^/?#]+/private-[0-9a-f]+/basic\.ics$'::text))))
);

create table if not exists public.family_links (
  token text not null,
  user_id uuid default auth.uid() not null,
  name text not null,
  created_at timestamp with time zone default now() not null,
  last_seen timestamp with time zone,
  constraint family_links_pkey PRIMARY KEY (token),
  constraint family_links_name_check CHECK (((length(name) >= 1) AND (length(name) <= 60))),
  constraint family_links_token_check CHECK ((token ~ '^[0-9a-f]{48}$'::text))
);

create table if not exists public.follows (
  follower uuid not null,
  followee uuid not null,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now() not null,
  constraint follows_pkey PRIMARY KEY (follower, followee),
  constraint follows_check CHECK ((follower <> followee)),
  constraint follows_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text])))
);

create table if not exists public.hobbies (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  title text not null,
  emoji text,
  kind text default 'other'::text not null,
  weekly_minutes integer default 0 not null,
  routine_id uuid,
  why text,
  archived boolean default false not null,
  created_at timestamp with time zone default now() not null,
  constraint hobbies_pkey PRIMARY KEY (id)
);

create table if not exists public.hobby_items (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  hobby_id uuid not null,
  title text not null,
  kind text default 'skill'::text not null,
  status text default 'want'::text not null,
  progress integer default 0 not null,
  note text,
  url text,
  sort integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  done_at timestamp with time zone,
  constraint hobby_items_pkey PRIMARY KEY (id)
);

create table if not exists public.hobby_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  hobby_id uuid not null,
  item_id uuid,
  date date not null,
  minutes integer not null,
  note text,
  mood integer,
  routine_date date,
  created_at timestamp with time zone default now() not null,
  constraint hobby_logs_pkey PRIMARY KEY (id)
);

create table if not exists public.ingest_tokens (
  user_id uuid not null,
  token text default encode(extensions.gen_random_bytes(24), 'hex'::text) not null,
  created_at timestamp with time zone default now() not null,
  constraint ingest_tokens_token_key UNIQUE (token),
  constraint ingest_tokens_pkey PRIMARY KEY (user_id)
);

create table if not exists public.mail_attachments (
  id uuid default gen_random_uuid() not null,
  mail_id uuid not null,
  filename text,
  mime_type text,
  size_bytes integer,
  data_base64 text,
  text_content text,
  constraint mail_attachments_mail_id_filename_key UNIQUE (mail_id, filename),
  constraint mail_attachments_pkey PRIMARY KEY (id)
);

create table if not exists public.mails (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  gmail_id text not null,
  thread_id text,
  sender text,
  subject text,
  received_at timestamp with time zone not null,
  body_text text,
  summary text,
  category text,
  action_items jsonb,
  processed_at timestamp with time zone,
  is_read boolean default false not null,
  created_at timestamp with time zone default now() not null,
  body_html text,
  constraint mails_user_id_gmail_id_key UNIQUE (user_id, gmail_id),
  constraint mails_pkey PRIMARY KEY (id)
);

create table if not exists public.notes (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  drive_id text not null,
  name text not null,
  folder text,
  course_code text,
  url text,
  modified_at timestamp with time zone,
  text_content text,
  summary text,
  processed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  ocr_error text,
  constraint notes_user_id_drive_id_key UNIQUE (user_id, drive_id),
  constraint notes_pkey PRIMARY KEY (id)
);

create table if not exists public.notifications (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  actor uuid,
  kind text not null,
  title text not null,
  body text,
  url text default '/'::text not null,
  dedupe text,
  created_at timestamp with time zone default now() not null,
  sent_at timestamp with time zone,
  read_at timestamp with time zone,
  constraint notifications_pkey PRIMARY KEY (id)
);

create table if not exists public.profiles (
  id uuid not null,
  email text not null,
  name text,
  avatar_url text,
  status text default 'pending'::text not null,
  is_admin boolean default false not null,
  share jsonb default '{"study": true, "grades": false, "courses": true, "progress": true, "routines": true, "schedule": "busy"}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  approved_at timestamp with time zone,
  bio text,
  program text,
  study_year text,
  avatar_emoji text,
  avatar_color text,
  weekly_goal_minutes integer,
  prefs jsonb default '{}'::jsonb not null,
  constraint profiles_pkey PRIMARY KEY (id),
  constraint profiles_avatar_color_check CHECK ((length(avatar_color) <= 20)),
  constraint profiles_avatar_emoji_check CHECK ((length(avatar_emoji) <= 16)),
  constraint profiles_bio_check CHECK ((length(bio) <= 300)),
  constraint profiles_program_check CHECK ((length(program) <= 80)),
  constraint profiles_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'blocked'::text]))),
  constraint profiles_study_year_check CHECK ((length(study_year) <= 30)),
  constraint profiles_weekly_goal_minutes_check CHECK (((weekly_goal_minutes >= 0) AND (weekly_goal_minutes <= 6000)))
);

create table if not exists public.push_sent (
  user_id uuid not null,
  key text not null,
  sent_at timestamp with time zone default now() not null,
  constraint push_sent_pkey PRIMARY KEY (user_id, key)
);

create table if not exists public.push_subscriptions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamp with time zone default now() not null,
  constraint push_subscriptions_endpoint_key UNIQUE (endpoint),
  constraint push_subscriptions_pkey PRIMARY KEY (id)
);

create table if not exists public.reactions (
  id uuid default gen_random_uuid() not null,
  from_user uuid not null,
  to_user uuid not null,
  emoji text not null,
  label text,
  created_at timestamp with time zone default now() not null,
  constraint reactions_pkey PRIMARY KEY (id),
  constraint reactions_check CHECK ((from_user <> to_user)),
  constraint reactions_emoji_check CHECK ((emoji = ANY (ARRAY['👏'::text, '🔥'::text, '💪'::text, '❤️'::text, '🎉'::text, '☕'::text, '🍀'::text, '😴'::text]))),
  constraint reactions_label_check CHECK ((length(label) <= 120))
);

create table if not exists public.routine_logs (
  routine_id uuid not null,
  user_id uuid not null,
  date date not null,
  created_at timestamp with time zone default now() not null,
  constraint routine_logs_pkey PRIMARY KEY (routine_id, user_id, date)
);

create table if not exists public.routine_members (
  routine_id uuid not null,
  user_id uuid not null,
  status text default 'pending'::text not null,
  constraint routine_members_pkey PRIMARY KEY (routine_id, user_id),
  constraint routine_members_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text])))
);

create table if not exists public.routines (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  title text not null,
  emoji text,
  category text default 'other'::text not null,
  mode text default 'fixed'::text not null,
  days integer[] default '{0,1,2,3,4,5,6}'::integer[] not null,
  start_time text,
  minutes integer default 30 not null,
  per_week integer,
  time_window text default 'any'::text not null,
  blocks_study boolean default true not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  starts_on date,
  overrides jsonb default '{}'::jsonb not null,
  constraint routines_pkey PRIMARY KEY (id),
  constraint routines_category_check CHECK ((category = ANY (ARRAY['sleep'::text, 'meal'::text, 'sport'::text, 'health'::text, 'habit'::text, 'chore'::text, 'hobby'::text, 'social'::text, 'other'::text]))),
  constraint routines_minutes_check CHECK (((minutes >= 0) AND (minutes <= 900))),
  constraint routines_mode_check CHECK ((mode = ANY (ARRAY['fixed'::text, 'flexible'::text]))),
  constraint routines_per_week_check CHECK (((per_week >= 1) AND (per_week <= 14))),
  constraint routines_start_time_check CHECK ((start_time ~ '^([01]\d|2[0-3]):[0-5]\d$'::text)),
  constraint routines_time_window_check CHECK ((time_window = ANY (ARRAY['morning'::text, 'noon'::text, 'afternoon'::text, 'evening'::text, 'any'::text]))),
  constraint routines_title_check CHECK (((length(title) >= 1) AND (length(title) <= 120)))
);

create table if not exists public.session_status (
  user_id uuid not null,
  session_key text not null,
  status text not null,
  updated_at timestamp with time zone default now() not null,
  minutes integer,
  constraint session_status_pkey PRIMARY KEY (user_id, session_key),
  constraint session_status_minutes_check CHECK (((minutes >= 0) AND (minutes <= 600))),
  constraint session_status_status_check CHECK ((status = ANY (ARRAY['done'::text, 'skipped'::text])))
);

create table if not exists public.spotify_tokens (
  user_id uuid default auth.uid() not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamp with time zone not null,
  spotify_name text,
  updated_at timestamp with time zone default now() not null,
  constraint spotify_tokens_pkey PRIMARY KEY (user_id)
);

create table if not exists public.stuck_points (
  id uuid default gen_random_uuid() not null,
  user_id uuid default auth.uid() not null,
  course_code text,
  topic text not null,
  resolved boolean default false not null,
  created_at timestamp with time zone default now() not null,
  constraint stuck_points_pkey PRIMARY KEY (id),
  constraint stuck_points_topic_check CHECK (((length(topic) >= 1) AND (length(topic) <= 300)))
);

create table if not exists public.study_live (
  user_id uuid not null,
  title text not null,
  course_code text,
  started_at timestamp with time zone default now() not null,
  ends_at timestamp with time zone not null,
  with_user uuid,
  constraint study_live_pkey PRIMARY KEY (user_id),
  constraint study_live_title_check CHECK ((length(title) <= 160))
);

create table if not exists public.study_prefs (
  user_id uuid not null,
  availability jsonb default '{"0": {"start": "18:00", "minutes": 120}, "1": {"start": "18:00", "minutes": 120}, "2": {"start": "18:00", "minutes": 120}, "3": {"start": "18:00", "minutes": 120}, "4": {"start": "18:00", "minutes": 120}, "5": {"start": "10:00", "minutes": 120}, "6": {"start": "20:00", "minutes": 0}}'::jsonb not null,
  session_minutes integer default 90 not null,
  fill_routine boolean default true not null,
  updated_at timestamp with time zone default now() not null,
  jewish jsonb,
  weekly_goal_minutes integer,
  focus jsonb default '{}'::jsonb not null,
  constraint study_prefs_pkey PRIMARY KEY (user_id),
  constraint study_prefs_session_minutes_check CHECK (((session_minutes >= 30) AND (session_minutes <= 240)))
);

create table if not exists public.updates (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  mail_id uuid,
  kind text not null,
  title text not null,
  detail text,
  payload jsonb default '{}'::jsonb not null,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now() not null,
  constraint updates_pkey PRIMARY KEY (id),
  constraint updates_kind_check CHECK ((kind = ANY (ARRAY['deadline'::text, 'tutorial_cancel'::text, 'tutorial_new'::text, 'grade'::text, 'info'::text]))),
  constraint updates_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'applied'::text, 'dismissed'::text])))
);

create table if not exists public.user_courses (
  user_id uuid not null,
  course_code text not null,
  semester text not null,
  color text default 'blue'::text not null,
  short text,
  added_at timestamp with time zone default now() not null,
  constraint user_courses_pkey PRIMARY KEY (user_id, course_code, semester)
);

create table if not exists public.user_events (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  date date not null,
  start_time text,
  end_time text,
  title text not null,
  kind text default 'custom'::text not null,
  course_code text,
  location text,
  source text default 'manual'::text not null,
  external_id text,
  created_at timestamp with time zone default now() not null,
  cancelled boolean default false not null,
  series_id uuid,
  repeat jsonb,
  constraint user_events_user_id_source_external_id_key UNIQUE (user_id, source, external_id),
  constraint user_events_pkey PRIMARY KEY (id),
  constraint user_events_kind_check CHECK ((kind = ANY (ARRAY['custom'::text, 'tutorial'::text, 'other'::text]))),
  constraint user_events_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'sheilta'::text, 'mail'::text, 'opal'::text, 'google'::text]))),
  constraint user_events_title_check CHECK (((length(title) >= 1) AND (length(title) <= 200)))
);

create table if not exists public.video_watched (
  user_id uuid default auth.uid() not null,
  video_id text not null,
  watched_at timestamp with time zone default now() not null,
  constraint video_watched_pkey PRIMARY KEY (user_id, video_id)
);

alter sequence public.course_videos_id_seq owned by public.course_videos.id;

-- ---------- Foreign keys ----------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assignment_progress_course_code_semester_n_fkey' and conrelid = 'public.assignment_progress'::regclass) then
    alter table public.assignment_progress add constraint assignment_progress_course_code_semester_n_fkey FOREIGN KEY (course_code, semester, n) REFERENCES public.assignments(course_code, semester, n) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assignment_progress_user_id_fkey' and conrelid = 'public.assignment_progress'::regclass) then
    alter table public.assignment_progress add constraint assignment_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assignment_reviews_user_id_fkey' and conrelid = 'public.assignment_reviews'::regclass) then
    alter table public.assignment_reviews add constraint assignment_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_course_code_semester_fkey' and conrelid = 'public.assignments'::regclass) then
    alter table public.assignments add constraint assignments_course_code_semester_fkey FOREIGN KEY (course_code, semester) REFERENCES public.courses(code, semester) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'book_chapters_user_id_fkey' and conrelid = 'public.book_chapters'::regclass) then
    alter table public.book_chapters add constraint book_chapters_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'book_chapters_book_id_fkey' and conrelid = 'public.book_chapters'::regclass) then
    alter table public.book_chapters add constraint book_chapters_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'book_questions_user_id_fkey' and conrelid = 'public.book_questions'::regclass) then
    alter table public.book_questions add constraint book_questions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'book_questions_chapter_id_fkey' and conrelid = 'public.book_questions'::regclass) then
    alter table public.book_questions add constraint book_questions_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.book_chapters(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'books_user_id_fkey' and conrelid = 'public.books'::regclass) then
    alter table public.books add constraint books_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'calendar_feeds_user_id_fkey' and conrelid = 'public.calendar_feeds'::regclass) then
    alter table public.calendar_feeds add constraint calendar_feeds_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cards_chapter_id_fkey' and conrelid = 'public.cards'::regclass) then
    alter table public.cards add constraint cards_chapter_id_fkey FOREIGN KEY (chapter_id) REFERENCES public.book_chapters(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cards_user_id_fkey' and conrelid = 'public.cards'::regclass) then
    alter table public.cards add constraint cards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'day_off_user_id_fkey' and conrelid = 'public.day_off'::regclass) then
    alter table public.day_off add constraint day_off_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'event_invites_inviter_fkey' and conrelid = 'public.event_invites'::regclass) then
    alter table public.event_invites add constraint event_invites_inviter_fkey FOREIGN KEY (inviter) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'event_invites_invitee_fkey' and conrelid = 'public.event_invites'::regclass) then
    alter table public.event_invites add constraint event_invites_invitee_fkey FOREIGN KEY (invitee) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'event_invites_event_id_fkey' and conrelid = 'public.event_invites'::regclass) then
    alter table public.event_invites add constraint event_invites_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.user_events(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'exams_user_id_fkey' and conrelid = 'public.exams'::regclass) then
    alter table public.exams add constraint exams_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'exams_course_code_semester_fkey' and conrelid = 'public.exams'::regclass) then
    alter table public.exams add constraint exams_course_code_semester_fkey FOREIGN KEY (course_code, semester) REFERENCES public.courses(code, semester) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'external_feeds_user_id_fkey' and conrelid = 'public.external_feeds'::regclass) then
    alter table public.external_feeds add constraint external_feeds_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'family_links_user_id_fkey' and conrelid = 'public.family_links'::regclass) then
    alter table public.family_links add constraint family_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'follows_followee_fkey' and conrelid = 'public.follows'::regclass) then
    alter table public.follows add constraint follows_followee_fkey FOREIGN KEY (followee) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'follows_follower_fkey' and conrelid = 'public.follows'::regclass) then
    alter table public.follows add constraint follows_follower_fkey FOREIGN KEY (follower) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hobbies_routine_id_fkey' and conrelid = 'public.hobbies'::regclass) then
    alter table public.hobbies add constraint hobbies_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hobbies_user_id_fkey' and conrelid = 'public.hobbies'::regclass) then
    alter table public.hobbies add constraint hobbies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hobby_items_user_id_fkey' and conrelid = 'public.hobby_items'::regclass) then
    alter table public.hobby_items add constraint hobby_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hobby_items_hobby_id_fkey' and conrelid = 'public.hobby_items'::regclass) then
    alter table public.hobby_items add constraint hobby_items_hobby_id_fkey FOREIGN KEY (hobby_id) REFERENCES public.hobbies(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hobby_logs_item_id_fkey' and conrelid = 'public.hobby_logs'::regclass) then
    alter table public.hobby_logs add constraint hobby_logs_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.hobby_items(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hobby_logs_user_id_fkey' and conrelid = 'public.hobby_logs'::regclass) then
    alter table public.hobby_logs add constraint hobby_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hobby_logs_hobby_id_fkey' and conrelid = 'public.hobby_logs'::regclass) then
    alter table public.hobby_logs add constraint hobby_logs_hobby_id_fkey FOREIGN KEY (hobby_id) REFERENCES public.hobbies(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ingest_tokens_user_id_fkey' and conrelid = 'public.ingest_tokens'::regclass) then
    alter table public.ingest_tokens add constraint ingest_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mail_attachments_mail_id_fkey' and conrelid = 'public.mail_attachments'::regclass) then
    alter table public.mail_attachments add constraint mail_attachments_mail_id_fkey FOREIGN KEY (mail_id) REFERENCES public.mails(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mails_user_id_fkey' and conrelid = 'public.mails'::regclass) then
    alter table public.mails add constraint mails_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notes_user_id_fkey' and conrelid = 'public.notes'::regclass) then
    alter table public.notes add constraint notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_actor_fkey' and conrelid = 'public.notifications'::regclass) then
    alter table public.notifications add constraint notifications_actor_fkey FOREIGN KEY (actor) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_user_id_fkey' and conrelid = 'public.notifications'::regclass) then
    alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_fkey' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'push_sent_user_id_fkey' and conrelid = 'public.push_sent'::regclass) then
    alter table public.push_sent add constraint push_sent_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'push_subscriptions_user_id_fkey' and conrelid = 'public.push_subscriptions'::regclass) then
    alter table public.push_subscriptions add constraint push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reactions_to_user_fkey' and conrelid = 'public.reactions'::regclass) then
    alter table public.reactions add constraint reactions_to_user_fkey FOREIGN KEY (to_user) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reactions_from_user_fkey' and conrelid = 'public.reactions'::regclass) then
    alter table public.reactions add constraint reactions_from_user_fkey FOREIGN KEY (from_user) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'routine_logs_user_id_fkey' and conrelid = 'public.routine_logs'::regclass) then
    alter table public.routine_logs add constraint routine_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'routine_logs_routine_id_fkey' and conrelid = 'public.routine_logs'::regclass) then
    alter table public.routine_logs add constraint routine_logs_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'routine_members_routine_id_fkey' and conrelid = 'public.routine_members'::regclass) then
    alter table public.routine_members add constraint routine_members_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'routine_members_user_id_fkey' and conrelid = 'public.routine_members'::regclass) then
    alter table public.routine_members add constraint routine_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'routines_user_id_fkey' and conrelid = 'public.routines'::regclass) then
    alter table public.routines add constraint routines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'session_status_user_id_fkey' and conrelid = 'public.session_status'::regclass) then
    alter table public.session_status add constraint session_status_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'spotify_tokens_user_id_fkey' and conrelid = 'public.spotify_tokens'::regclass) then
    alter table public.spotify_tokens add constraint spotify_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'stuck_points_user_id_fkey' and conrelid = 'public.stuck_points'::regclass) then
    alter table public.stuck_points add constraint stuck_points_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'study_live_user_id_fkey' and conrelid = 'public.study_live'::regclass) then
    alter table public.study_live add constraint study_live_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'study_live_with_user_fkey' and conrelid = 'public.study_live'::regclass) then
    alter table public.study_live add constraint study_live_with_user_fkey FOREIGN KEY (with_user) REFERENCES auth.users(id) ON DELETE SET NULL;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'study_prefs_user_id_fkey' and conrelid = 'public.study_prefs'::regclass) then
    alter table public.study_prefs add constraint study_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'updates_mail_id_fkey' and conrelid = 'public.updates'::regclass) then
    alter table public.updates add constraint updates_mail_id_fkey FOREIGN KEY (mail_id) REFERENCES public.mails(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'updates_user_id_fkey' and conrelid = 'public.updates'::regclass) then
    alter table public.updates add constraint updates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_courses_user_id_fkey' and conrelid = 'public.user_courses'::regclass) then
    alter table public.user_courses add constraint user_courses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_courses_course_code_semester_fkey' and conrelid = 'public.user_courses'::regclass) then
    alter table public.user_courses add constraint user_courses_course_code_semester_fkey FOREIGN KEY (course_code, semester) REFERENCES public.courses(code, semester);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'user_events_user_id_fkey' and conrelid = 'public.user_events'::regclass) then
    alter table public.user_events add constraint user_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'video_watched_user_id_fkey' and conrelid = 'public.video_watched'::regclass) then
    alter table public.video_watched add constraint video_watched_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  end if;
end $$;

-- ---------- Indexes (besides primary keys and unique constraints) ----------
CREATE INDEX IF NOT EXISTS book_chapters_user ON public.book_chapters USING btree (user_id);
CREATE INDEX IF NOT EXISTS book_questions_chapter ON public.book_questions USING btree (chapter_id, idx);
CREATE INDEX IF NOT EXISTS books_user_course ON public.books USING btree (user_id, course_code);
CREATE INDEX IF NOT EXISTS cards_user_due ON public.cards USING btree (user_id, due_at);
CREATE INDEX IF NOT EXISTS hobby_logs_hobby ON public.hobby_logs USING btree (hobby_id, date);
CREATE INDEX IF NOT EXISTS mails_user_received ON public.mails USING btree (user_id, received_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe ON public.notifications USING btree (user_id, dedupe) WHERE (dedupe IS NOT NULL);
CREATE INDEX IF NOT EXISTS notifications_unsent ON public.notifications USING btree (created_at) WHERE (sent_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS updates_dedupe ON public.updates USING btree (user_id, kind, COALESCE(mail_id, '00000000-0000-0000-0000-000000000000'::uuid), md5((payload)::text));
CREATE INDEX IF NOT EXISTS user_events_series_idx ON public.user_events USING btree (series_id) WHERE (series_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS user_events_user_date ON public.user_events USING btree (user_id, date);

-- ---------- Functions ----------
CREATE OR REPLACE FUNCTION public._apply_update(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u public.updates; sem text := '2027א';
begin
  select * into u from public.updates where id = p_id;
  if u.id is null or u.status = 'applied' then return false; end if;
  if u.kind = 'deadline' then
    insert into public.assignment_progress (user_id, course_code, semester, n, due_override)
    select u.user_id, u.payload->>'course_code', sem, u.payload->>'n', (u.payload->>'due')::date
    where exists (select 1 from public.assignments a where a.course_code = u.payload->>'course_code' and a.semester = sem and a.n = u.payload->>'n')
    on conflict (user_id, course_code, semester, n) do update set due_override = excluded.due_override, updated_at = now();
  elsif u.kind = 'grade' then
    insert into public.assignment_progress (user_id, course_code, semester, n, status, grade)
    select u.user_id, u.payload->>'course_code', sem, u.payload->>'n', 'submitted', (u.payload->>'grade')::int
    where exists (select 1 from public.assignments a where a.course_code = u.payload->>'course_code' and a.semester = sem and a.n = u.payload->>'n')
    on conflict (user_id, course_code, semester, n) do update set status = 'submitted', grade = excluded.grade, updated_at = now();
  elsif u.kind = 'tutorial_cancel' then
    update public.user_events set cancelled = true
    where user_id = u.user_id and kind = 'tutorial' and date = (u.payload->>'date')::date
      and (u.payload->>'course_code' is null or course_code = u.payload->>'course_code');
  elsif u.kind = 'tutorial_new' then
    insert into public.user_events (user_id, date, start_time, end_time, title, kind, course_code, location, source, external_id)
    values (u.user_id, (u.payload->>'date')::date, u.payload->>'start', u.payload->>'end',
            coalesce(u.payload->>'title', 'מפגש הנחיה'), 'tutorial', u.payload->>'course_code', u.payload->>'location', 'mail', 'update:' || u.id);
  end if;
  update public.updates set status = 'applied' where id = p_id;
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public._courses_for(uid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
      'code', c.code, 'name', c.name, 'name_en', c.name_en, 'opal_id', c.opal_id, 'coordinator', c.coordinator,
      'final_assessment', c.final_assessment, 'min_weight', c.min_weight, 'max_weight', c.max_weight, 'rules', c.rules,
      'color', uc.color, 'short', uc.short,
      'assignments', coalesce((select jsonb_agg(jsonb_build_object('n', a.n, 'type', a.type, 'weight', a.weight, 'due', a.due) order by a.n)
                               from public.assignments a where a.course_code = c.code and a.semester = c.semester), '[]'::jsonb))
    order by uc.added_at), '[]'::jsonb)
  from public.user_courses uc join public.courses c on c.code = uc.course_code and c.semester = uc.semester
  where uc.user_id = uid and uc.semester = public.current_semester() $function$
;

CREATE OR REPLACE FUNCTION public._feed_for(uid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'prefs', (select to_jsonb(p) - 'user_id' from public.study_prefs p where p.user_id = uid),
    'courses', public._courses_for(uid),
    'progress', coalesce((select jsonb_agg(jsonb_build_object('course_code', a.course_code, 'semester', a.semester, 'n', a.n, 'status', a.status, 'grade', a.grade, 'due_override', a.due_override))
                          from public.assignment_progress a where a.user_id = uid), '[]'::jsonb),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('course_code', e.course_code, 'semester', e.semester, 'moed', e.moed, 'date', e.date, 'start_time', e.start_time))
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
$function$
;

CREATE OR REPLACE FUNCTION public._first_name(uid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(split_part(nullif(trim(name), ''), ' ', 1), split_part(email, '@', 1), 'מישהו') from public.profiles where id = uid $function$
;

CREATE OR REPLACE FUNCTION public._notify(p_user uuid, p_actor uuid, p_kind text, p_title text, p_body text, p_url text, p_dedupe text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_user is null or p_user = p_actor then return; end if;
  insert into public.notifications (user_id, actor, kind, title, body, url, dedupe)
  values (p_user, p_actor, p_kind, left(p_title, 200), left(p_body, 300), p_url, p_dedupe)
  on conflict do nothing;
end $function$
;

CREATE OR REPLACE FUNCTION public._on_follow()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public._notify(new.followee, new.follower, 'follow_request', public._first_name(new.follower) || ' רוצה לעקוב אחריך', 'אפשר לאשר בעמוד החברים', '/friends', 'follow:' || new.follower);
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    perform public._notify(new.follower, new.followee, 'follow_accepted', public._first_name(new.followee) || ' אישר/ה את בקשת המעקב', null, '/friends', 'accepted:' || new.followee);
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._on_invite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.user_events;
begin
  select * into e from public.user_events where id = new.event_id;
  if tg_op = 'INSERT' then
    perform public._notify(new.invitee, new.inviter, 'invite', public._first_name(new.inviter) || ' מזמין/ה אותך: ' || e.title,
      to_char(e.date, 'DD/MM') || coalesce(' · ' || e.start_time, ''), '/', 'invite:' || new.event_id);
  elsif new.status <> old.status and new.status in ('accepted','declined') then
    perform public._notify(new.inviter, new.invitee, 'invite_answer',
      public._first_name(new.invitee) || case when new.status = 'accepted' then ' מגיע/ה ל' else ' לא יגיע/תגיע ל' end || e.title,
      to_char(e.date, 'DD/MM') || coalesce(' · ' || e.start_time, ''), '/semester', 'answer:' || new.event_id || ':' || new.invitee || ':' || new.status);
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._on_join()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.with_user is not null then
    perform public._notify(new.with_user, new.user_id, 'study_join', public._first_name(new.user_id) || ' מצטרף/ת ללמוד איתך 📚', new.title, '/',
      'join:' || new.user_id || ':' || current_date || ':' || extract(hour from now()));
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._on_reaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public._notify(new.to_user, new.from_user, 'cheer', public._first_name(new.from_user) || ' שלח/ה לך ' || new.emoji, new.label, '/friends',
    'cheer:' || new.from_user || ':' || coalesce(new.label, '') || ':' || current_date);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._on_routine_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.routines; p uuid;
begin
  if new.date <> current_date then return new; end if;
  select * into r from public.routines where id = new.routine_id;
  for p in select r.user_id union select m.user_id from public.routine_members m where m.routine_id = r.id and m.status = 'accepted' loop
    if p <> new.user_id and not exists (select 1 from public.routine_logs l where l.routine_id = r.id and l.user_id = p and l.date = new.date) then
      perform public._notify(p, new.user_id, 'routine_nudge', public._first_name(new.user_id) || ' כבר סימן/ה ' || r.title || ' היום 💪', 'תורך?', '/routines',
        'nudge:' || r.id || ':' || new.date);
    end if;
  end loop;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._on_routine_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.routines;
begin
  select * into r from public.routines where id = new.routine_id;
  if tg_op = 'INSERT' then
    perform public._notify(new.user_id, r.user_id, 'routine_invite', public._first_name(r.user_id) || ' מזמין/ה אותך לשגרה: ' || r.title, null, '/routines', 'rinvite:' || r.id);
  elsif new.status = 'accepted' and old.status <> 'accepted' then
    perform public._notify(r.user_id, new.user_id, 'routine_joined', public._first_name(new.user_id) || ' הצטרף/ה ל' || r.title, null, '/routines', 'rjoined:' || r.id || ':' || new.user_id);
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_set_status(p_user uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_status not in ('pending','approved','blocked') then raise exception 'bad status'; end if;
  if p_user = auth.uid() then raise exception 'not on yourself'; end if;
  update public.profiles set status = p_status, approved_at = case when p_status = 'approved' then now() else approved_at end where id = p_user;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_users()
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return query select jsonb_build_object('id', p.id, 'email', p.email, 'name', p.name, 'avatar_url', p.avatar_url,
      'status', p.status, 'is_admin', p.is_admin, 'created_at', p.created_at,
      'courses', (select count(*) from public.user_courses c where c.user_id = p.id))
    from public.profiles p order by (p.status = 'pending') desc, p.created_at desc;
end $function$
;

CREATE OR REPLACE FUNCTION public.answer_invite(p_event uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_status not in ('accepted','declined') then raise exception 'bad status'; end if;
  update public.event_invites set status = p_status where event_id = p_event and invitee = auth.uid();
end $function$
;

CREATE OR REPLACE FUNCTION public.answer_routine(p_routine uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_accept then update public.routine_members set status = 'accepted' where routine_id = p_routine and user_id = auth.uid();
  else delete from public.routine_members where routine_id = p_routine and user_id = auth.uid(); end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.apply_update(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (select 1 from public.updates where id = p_id and user_id = (select auth.uid())) then
    raise exception 'not found';
  end if;
  return public._apply_update(p_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.calendar_feed(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid;
begin
  if p_token is null or length(p_token) < 32 then return null; end if;
  select f.user_id into uid from public.calendar_feeds f where f.token = p_token;
  if uid is null then return null; end if;
  return public._feed_for(uid);
end; $function$
;

CREATE OR REPLACE FUNCTION public.catalog_add_course(p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a jsonb; fresh boolean;
begin
  if not public.is_approved() then raise exception 'not allowed'; end if;
  if coalesce(p->>'code','') !~ '^\d{5}$' or p->>'semester' <> public.current_semester() then raise exception 'bad course'; end if;
  -- A course already in the shared catalog is only refreshed by an admin; others just add new courses.
  fresh := not exists (select 1 from public.courses where code = p->>'code' and semester = p->>'semester');
  if not fresh and not public.is_admin() then return; end if;
  insert into public.courses (code, semester, name, name_en, opal_id, coordinator, final_assessment, min_weight, max_weight, rules)
  values (p->>'code', p->>'semester', left(p->>'name', 200), null, nullif(p->>'opal_id','')::int, left(p->>'coordinator', 200),
          left(p->>'final_assessment', 200), (p->>'min_weight')::int, (p->>'max_weight')::int, '{}')
  on conflict (code, semester) do update set name = excluded.name, coordinator = excluded.coordinator,
    final_assessment = excluded.final_assessment, min_weight = excluded.min_weight, max_weight = excluded.max_weight;
  for a in select * from jsonb_array_elements(coalesce(p->'assignments', '[]'::jsonb)) loop
    if a->>'type' in ('file','online','participation') and a->>'n' ~ '^\d{1,3}$' then
      insert into public.assignments (course_code, semester, n, type, weight, due)
      values (p->>'code', p->>'semester', a->>'n', a->>'type', (a->>'weight')::int, (a->>'due')::date)
      on conflict (course_code, semester, n) do update set type = excluded.type, weight = excluded.weight, due = excluded.due;
    end if;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.claim_tick()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with u as (update public.app_keys set tick_at = now() where id = 1 and (tick_at is null or tick_at < now() - interval '8 minutes') returning 1)
  select exists (select 1 from u);
$function$
;

CREATE OR REPLACE FUNCTION public.connected(a uuid, b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.follows f where f.status = 'accepted'
                 and ((f.follower = a and f.followee = b) or (f.follower = b and f.followee = a))) $function$
;

CREATE OR REPLACE FUNCTION public.current_semester()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$ select '2027א'::text $function$
;

CREATE OR REPLACE FUNCTION public.follow_answer(p_follower uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_accept then
    update public.follows set status = 'accepted' where follower = p_follower and followee = auth.uid();
  else
    delete from public.follows where follower = p_follower and followee = auth.uid();
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.follow_request(p_user uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_approved() or not public.is_approved(p_user) or p_user = auth.uid() then raise exception 'not allowed'; end if;
  insert into public.follows (follower, followee) values (auth.uid(), p_user) on conflict do nothing;
  return (select status from public.follows where follower = auth.uid() and followee = p_user);
end $function$
;

CREATE OR REPLACE FUNCTION public.friend_view(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.profiles; s jsonb; f jsonb; allowed boolean; detail boolean; busy boolean;
begin
  select * into p from public.profiles where id = p_user and status = 'approved';
  if p.id is null or not public.is_approved() then return null; end if;
  allowed := p_user = auth.uid() or exists (select 1 from public.follows where follower = auth.uid() and followee = p_user and status = 'accepted');
  if not allowed then return null; end if;
  s := p.share; f := public._feed_for(p_user);
  detail := p_user = auth.uid() or s->>'schedule' = 'details';
  busy := detail or s->>'schedule' = 'busy';
  return jsonb_build_object(
    'id', p.id, 'name', coalesce(p.name, split_part(p.email, '@', 1)), 'avatar_url', p.avatar_url, 'share', s,
    'avatar_emoji', p.avatar_emoji, 'avatar_color', p.avatar_color, 'bio', p.bio, 'program', p.program, 'study_year', p.study_year,
    'weekly_goal_minutes', case when (s->>'study')::boolean then p.weekly_goal_minutes end,
    'member_since', p.created_at,
    'courses', case when (s->>'courses')::boolean then f->'courses' else '[]'::jsonb end,
    'progress', case when (s->>'progress')::boolean then
        (select coalesce(jsonb_agg(case when (s->>'grades')::boolean then x else x - 'grade' end), '[]'::jsonb) from jsonb_array_elements(f->'progress') x)
      else '[]'::jsonb end,
    'exams', case when (s->>'courses')::boolean then f->'exams' else '[]'::jsonb end,
    'study', case when (s->>'study')::boolean then f->'session_minutes' else '{}'::jsonb end,
    'schedule', s->>'schedule',
    -- only what the planner needs; never the Shabbat city or study focus
    'prefs', case when busy then (f->'prefs') - 'jewish' - 'focus' end,
    -- "busy": times only. Titles, places and sources only with "details".
    'events', case
      when detail then f->'events'
      when busy then (select coalesce(jsonb_agg(jsonb_build_object('id', e->'id', 'date', e->'date', 'start_time', e->'start_time', 'end_time', e->'end_time', 'kind', e->'kind', 'cancelled', e->'cancelled', 'title', '', 'source', 'busy')), '[]'::jsonb) from jsonb_array_elements(f->'events') e)
      else '[]'::jsonb end,
    'session_status', case when busy then f->'session_status' else '{}'::jsonb end,
    'routines', case when (s->>'routines')::boolean then f->'routines' else '[]'::jsonb end,
    'routine_logs', case when (s->>'routines')::boolean then f->'routine_logs' else '[]'::jsonb end,
    'cheers_received', (select count(*) from public.reactions r where r.to_user = p_user),
    'friends_count', (select count(*) from public.follows x where (x.follower = p_user or x.followee = p_user) and x.status = 'accepted')
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner boolean := lower(new.email) = 'yuv12of@gmail.com';
begin
  insert into public.profiles (id, email, name, avatar_url, status, is_admin, approved_at)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          new.raw_user_meta_data->>'avatar_url',
          case when owner then 'approved' else 'pending' end, owner, case when owner then now() end)
  on conflict (id) do nothing;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.ingest_mail(p_token text, p_mail jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid; mid uuid; att jsonb;
begin
  if p_token is null or length(p_token) < 32 then raise exception 'bad token'; end if;
  select t.user_id into uid from public.ingest_tokens t where t.token = p_token;
  if uid is null then raise exception 'bad token'; end if;
  if coalesce(p_mail->>'sender', '') !~* 'openu\.ac\.il' then return 'ignored'; end if;

  select id into mid from public.mails where user_id = uid and gmail_id = p_mail->>'id';
  if mid is not null then
    update public.mails set body_html = left(p_mail->>'html', 400000)
    where id = mid and body_html is null and p_mail ? 'html';
    for att in select * from jsonb_array_elements(coalesce(p_mail->'attachments', '[]'::jsonb)) loop
      if coalesce(att->>'text', '') <> '' then
        update public.mail_attachments set text_content = left(att->>'text', 100000)
        where mail_id = mid and filename = left(att->>'name', 200) and text_content is null;
      end if;
    end loop;
    return 'exists';
  end if;

  insert into public.mails (user_id, gmail_id, thread_id, sender, subject, received_at, body_text, body_html)
  values (uid, p_mail->>'id', p_mail->>'threadId', p_mail->>'sender', left(p_mail->>'subject', 500),
          (p_mail->>'date')::timestamptz, left(p_mail->>'body', 200000), left(p_mail->>'html', 400000))
  returning id into mid;

  for att in select * from jsonb_array_elements(coalesce(p_mail->'attachments', '[]'::jsonb)) loop
    if coalesce((att->>'size')::int, 0) <= 4000000 then
      insert into public.mail_attachments (mail_id, filename, mime_type, size_bytes, data_base64, text_content)
      values (mid, left(att->>'name', 200), att->>'type', (att->>'size')::int, att->>'data', nullif(left(att->>'text', 100000), ''))
      on conflict do nothing;
    end if;
  end loop;
  return 'stored';
end $function$
;

CREATE OR REPLACE FUNCTION public.ingest_note(p_token text, p_note jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid;
begin
  select t.user_id into uid from public.ingest_tokens t where t.token = p_token;
  if uid is null then raise exception 'bad token'; end if;
  insert into public.notes (user_id, drive_id, name, folder, course_code, url, modified_at, text_content, ocr_error)
  values (uid, p_note->>'id', left(p_note->>'name', 300), left(p_note->>'folder', 300), p_note->>'course',
          p_note->>'url', (p_note->>'modified')::timestamptz, left(p_note->>'text', 300000), left(p_note->>'ocrError', 500))
  on conflict (user_id, drive_id) do update set
    name = excluded.name, folder = excluded.folder, course_code = coalesce(excluded.course_code, public.notes.course_code),
    url = excluded.url, modified_at = excluded.modified_at, text_content = excluded.text_content, ocr_error = excluded.ocr_error,
    processed_at = case when public.notes.text_content is distinct from excluded.text_content then null else public.notes.processed_at end;
  return 'stored';
end; $function$
;

CREATE OR REPLACE FUNCTION public.invite_to_event(p_event uuid, p_users uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; n int := 0;
begin
  if not exists (select 1 from public.user_events e where e.id = p_event and e.user_id = auth.uid()) then raise exception 'not found'; end if;
  foreach u in array coalesce(p_users, '{}') loop
    if public.connected(auth.uid(), u) then
      insert into public.event_invites (event_id, invitee, inviter) values (p_event, u, auth.uid()) on conflict do nothing;
      n := n + 1;
    end if;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.invited_to(p_event uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.event_invites i where i.event_id = p_event and i.invitee = auth.uid()) $function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((select is_admin and status = 'approved' from public.profiles where id = auth.uid()), false) $function$
;

CREATE OR REPLACE FUNCTION public.is_approved(uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((select status = 'approved' from public.profiles where id = uid), false) $function$
;

CREATE OR REPLACE FUNCTION public.mail_rules_apply(p_token text, p_gmail_id text, p_category text, p_summary text, p_actions jsonb, p_updates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid; m public.mails; up jsonb; new_id uuid; created jsonb := '[]'::jsonb;
begin
  select t.user_id into uid from public.ingest_tokens t where t.token = p_token;
  if uid is null then raise exception 'bad token'; end if;
  select * into m from public.mails where user_id = uid and gmail_id = p_gmail_id;
  if m.id is null then return created; end if;
  if p_category is not null and m.processed_at is null then
    update public.mails set category = left(p_category, 40), summary = left(p_summary, 1000),
      action_items = coalesce(p_actions, '[]'::jsonb), processed_at = now() where id = m.id;
  end if;
  for up in select * from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) loop
    insert into public.updates (user_id, mail_id, kind, title, detail, payload)
    values (uid, m.id, up->>'kind', left(up->>'title', 300), left(up->>'detail', 2000), coalesce(up->'payload', '{}'::jsonb))
    on conflict do nothing returning id into new_id;
    if new_id is not null then
      created := created || jsonb_build_object('id', new_id, 'title', up->>'title');
      if coalesce((up->>'auto')::boolean, false) then perform public._apply_update(new_id); end if;
      new_id := null;
    end if;
  end loop;
  return created;
end $function$
;

CREATE OR REPLACE FUNCTION public.mark_notifications_read()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null $function$
;

CREATE OR REPLACE FUNCTION public.my_badges()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'friends', (select count(*) from public.follows where followee = auth.uid() and status = 'pending')
             + (select count(*) from public.event_invites i join public.user_events e on e.id = i.event_id
                where i.invitee = auth.uid() and i.status = 'pending' and e.date >= current_date)
             + (select count(*) from public.routine_members where user_id = auth.uid() and status = 'pending')
             + (select count(*) from public.notifications where user_id = auth.uid() and read_at is null
                and kind not in ('follow_request','invite','routine_invite')),
    'admin', case when public.is_admin() then (select count(*) from public.profiles where status = 'pending') end
  ) $function$
;

CREATE OR REPLACE FUNCTION public.names_for(p_ids uuid[])
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('id', p.id, 'name', coalesce(p.name, split_part(p.email, '@', 1)), 'avatar_url', p.avatar_url,
                            'avatar_emoji', p.avatar_emoji, 'avatar_color', p.avatar_color)
  from public.profiles p where p.id = any(p_ids) and p.status = 'approved' $function$
;

CREATE OR REPLACE FUNCTION public.opal_feed_url(p_token text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid;
begin
  select t.user_id into uid from public.ingest_tokens t where t.token = p_token;
  if uid is null then raise exception 'bad token'; end if;
  return (select url from public.external_feeds where user_id = uid and kind = 'opal');
end $function$
;

CREATE OR REPLACE FUNCTION public.opal_replace(p_token text, p_events jsonb, p_status text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid; n int := 0;
begin
  select t.user_id into uid from public.ingest_tokens t where t.token = p_token;
  if uid is null then raise exception 'bad token'; end if;
  if p_events is not null then
    delete from public.user_events where user_id = uid and source = 'opal';
    insert into public.user_events (user_id, date, start_time, end_time, title, kind, course_code, location, source, external_id)
    select uid, (e->>'date')::date, e->>'start', e->>'end', left(e->>'title', 200),
           case when e->>'kind' in ('tutorial','other','custom') then e->>'kind' else 'other' end,
           e->>'course_code', left(e->>'location', 200), 'opal', left(e->>'uid', 300)
    from jsonb_array_elements(p_events) e
    limit 500;
    get diagnostics n = row_count;
  end if;
  update public.external_feeds set last_synced_at = now(), last_status = left(p_status, 300),
    last_count = case when p_events is null then last_count else n end
  where user_id = uid and kind = 'opal';
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.people(p_query text DEFAULT ''::text)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me uuid := auth.uid(); q text := lower(trim(coalesce(p_query, '')));
begin
  if not public.is_approved() then return; end if;
  return query
  select jsonb_build_object('id', p.id, 'name', coalesce(p.name, split_part(p.email, '@', 1)), 'avatar_url', p.avatar_url,
      'avatar_emoji', p.avatar_emoji, 'avatar_color', p.avatar_color, 'program', p.program,
      'i_follow', (select f.status from public.follows f where f.follower = me and f.followee = p.id),
      'follows_me', (select f.status from public.follows f where f.follower = p.id and f.followee = me))
  from public.profiles p
  where p.status = 'approved' and p.id <> me
    and (q = '' and exists (select 1 from public.follows f where (f.follower = me and f.followee = p.id) or (f.follower = p.id and f.followee = me))
         or q <> '' and (lower(coalesce(p.name, '')) like '%' || q || '%' or lower(p.email) = q))
  order by p.name nulls last
  limit 50;
end $function$
;

CREATE OR REPLACE FUNCTION public.private_feed(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid;
begin
  if p_token is null or length(p_token) < 32 then return null; end if;
  select t.user_id into uid from public.ingest_tokens t where t.token = p_token;
  if uid is null then return null; end if;
  return public._feed_for(uid) || jsonb_build_object(
    'mails', coalesce((select jsonb_agg(jsonb_build_object('subject', m.subject, 'summary', m.summary, 'category', m.category, 'received_at', m.received_at) order by m.received_at desc)
                       from public.mails m where m.user_id = uid and m.received_at > now() - interval '36 hours'), '[]'::jsonb),
    'cards_due', (select count(*) from public.cards c where c.user_id = uid and c.due_at <= now()),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                               from public.push_subscriptions s where s.user_id = uid), '[]'::jsonb)
  );
end; $function$
;

CREATE OR REPLACE FUNCTION public.push_mark(p_token text, p_key text, p_dead_endpoint text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid; n int;
begin
  select t.user_id into uid from public.ingest_tokens t where t.token = p_token;
  if uid is null then raise exception 'bad token'; end if;
  if p_dead_endpoint is not null then
    delete from public.push_subscriptions where user_id = uid and endpoint = p_dead_endpoint;
    return true;
  end if;
  insert into public.push_sent (user_id, key) values (uid, left(p_key, 300)) on conflict do nothing;
  get diagnostics n = row_count;
  return n > 0;
end; $function$
;

CREATE OR REPLACE FUNCTION public.routine_role(p_routine uuid, uid uuid DEFAULT auth.uid())
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when exists (select 1 from public.routines r where r.id = p_routine and r.user_id = uid) then 'owner'
              else (select m.status from public.routine_members m where m.routine_id = p_routine and m.user_id = uid) end $function$
;

CREATE OR REPLACE FUNCTION public.share_routine(p_routine uuid, p_users uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; n int := 0;
begin
  if public.routine_role(p_routine) is distinct from 'owner' then raise exception 'not found'; end if;
  foreach u in array coalesce(p_users, '{}') loop
    if public.connected(auth.uid(), u) then
      insert into public.routine_members (routine_id, user_id) values (p_routine, u) on conflict do nothing;
      n := n + 1;
    end if;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.vapid_init(p_public text, p_private text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.app_keys (id, vapid_public, vapid_private) values (1, p_public, p_private) on conflict (id) do nothing;
  return (select vapid_public from public.app_keys where id = 1);
end; $function$
;

CREATE OR REPLACE FUNCTION public.vapid_private(p_token text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (select 1 from public.ingest_tokens t where t.token = p_token) then raise exception 'bad token'; end if;
  return (select vapid_private from public.app_keys where id = 1);
end; $function$
;

CREATE OR REPLACE FUNCTION public.vapid_public()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select vapid_public from public.app_keys where id = 1;
$function$
;

-- ---------- Triggers ----------
drop trigger if exists follows_notify on public.follows;
CREATE TRIGGER follows_notify AFTER INSERT OR UPDATE ON public.follows FOR EACH ROW EXECUTE FUNCTION public._on_follow();
drop trigger if exists invites_notify on public.event_invites;
CREATE TRIGGER invites_notify AFTER INSERT OR UPDATE ON public.event_invites FOR EACH ROW EXECUTE FUNCTION public._on_invite();
drop trigger if exists on_auth_user_created on auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
drop trigger if exists reactions_notify on public.reactions;
CREATE TRIGGER reactions_notify AFTER INSERT ON public.reactions FOR EACH ROW EXECUTE FUNCTION public._on_reaction();
drop trigger if exists routine_logs_notify on public.routine_logs;
CREATE TRIGGER routine_logs_notify AFTER INSERT ON public.routine_logs FOR EACH ROW EXECUTE FUNCTION public._on_routine_log();
drop trigger if exists routine_members_notify on public.routine_members;
CREATE TRIGGER routine_members_notify AFTER INSERT OR UPDATE ON public.routine_members FOR EACH ROW EXECUTE FUNCTION public._on_routine_member();
drop trigger if exists study_live_notify on public.study_live;
CREATE TRIGGER study_live_notify AFTER INSERT OR UPDATE OF with_user ON public.study_live FOR EACH ROW EXECUTE FUNCTION public._on_join();

-- ---------- Row level security ----------
alter table public.app_keys enable row level security;
alter table public.assignment_progress enable row level security;
alter table public.assignment_reviews enable row level security;
alter table public.assignments enable row level security;
alter table public.book_chapters enable row level security;
alter table public.book_questions enable row level security;
alter table public.books enable row level security;
alter table public.calendar_feeds enable row level security;
alter table public.cards enable row level security;
alter table public.course_readings enable row level security;
alter table public.course_videos enable row level security;
alter table public.courses enable row level security;
alter table public.day_off enable row level security;
alter table public.event_invites enable row level security;
alter table public.exams enable row level security;
alter table public.external_feeds enable row level security;
alter table public.family_links enable row level security;
alter table public.follows enable row level security;
alter table public.hobbies enable row level security;
alter table public.hobby_items enable row level security;
alter table public.hobby_logs enable row level security;
alter table public.ingest_tokens enable row level security;
alter table public.mail_attachments enable row level security;
alter table public.mails enable row level security;
alter table public.notes enable row level security;
alter table public.notifications enable row level security;
alter table public.profiles enable row level security;
alter table public.push_sent enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reactions enable row level security;
alter table public.routine_logs enable row level security;
alter table public.routine_members enable row level security;
alter table public.routines enable row level security;
alter table public.session_status enable row level security;
alter table public.spotify_tokens enable row level security;
alter table public.stuck_points enable row level security;
alter table public.study_live enable row level security;
alter table public.study_prefs enable row level security;
alter table public.updates enable row level security;
alter table public.user_courses enable row level security;
alter table public.user_events enable row level security;
alter table public.video_watched enable row level security;

drop policy if exists "users manage their own progress" on public.assignment_progress;
create policy "users manage their own progress" on public.assignment_progress as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "own reviews" on public.assignment_reviews;
create policy "own reviews" on public.assignment_reviews as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "signed-in users read assignments" on public.assignments;
create policy "signed-in users read assignments" on public.assignments as permissive for select to authenticated
  using (true);
drop policy if exists "own book chapters" on public.book_chapters;
create policy "own book chapters" on public.book_chapters as permissive for all to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "own book questions" on public.book_questions;
create policy "own book questions" on public.book_questions as permissive for all to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "own books" on public.books;
create policy "own books" on public.books as permissive for all to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "users manage their own feed" on public.calendar_feeds;
create policy "users manage their own feed" on public.calendar_feeds as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "own cards" on public.cards;
create policy "own cards" on public.cards as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "readings readable" on public.course_readings;
create policy "readings readable" on public.course_readings as permissive for select to authenticated
  using (true);
drop policy if exists "read videos" on public.course_videos;
create policy "read videos" on public.course_videos as permissive for select to authenticated
  using (true);
drop policy if exists "signed-in users read courses" on public.courses;
create policy "signed-in users read courses" on public.courses as permissive for select to authenticated
  using (true);
drop policy if exists "own days off" on public.day_off;
create policy "own days off" on public.day_off as permissive for all to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "see own invites" on public.event_invites;
create policy "see own invites" on public.event_invites as permissive for select to authenticated
  using (((( SELECT auth.uid() AS uid) = invitee) OR (( SELECT auth.uid() AS uid) = inviter)));
drop policy if exists "users manage their own exams" on public.exams;
create policy "users manage their own exams" on public.exams as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "own feeds" on public.external_feeds;
create policy "own feeds" on public.external_feeds as permissive for all to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "own family links" on public.family_links;
create policy "own family links" on public.family_links as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "remove own follows" on public.follows;
create policy "remove own follows" on public.follows as permissive for delete to authenticated
  using (((( SELECT auth.uid() AS uid) = follower) OR (( SELECT auth.uid() AS uid) = followee)));
drop policy if exists "see own follows" on public.follows;
create policy "see own follows" on public.follows as permissive for select to authenticated
  using (((( SELECT auth.uid() AS uid) = follower) OR (( SELECT auth.uid() AS uid) = followee)));
drop policy if exists "own hobbies" on public.hobbies;
create policy "own hobbies" on public.hobbies as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "own hobby items" on public.hobby_items;
create policy "own hobby items" on public.hobby_items as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "own hobby logs" on public.hobby_logs;
create policy "own hobby logs" on public.hobby_logs as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "own ingest token" on public.ingest_tokens;
create policy "own ingest token" on public.ingest_tokens as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "own mail attachments" on public.mail_attachments;
create policy "own mail attachments" on public.mail_attachments as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM public.mails m
  WHERE ((m.id = mail_attachments.mail_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))));
drop policy if exists "own mails" on public.mails;
create policy "own mails" on public.mails as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "own notes" on public.notes;
create policy "own notes" on public.notes as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "own notifications read" on public.notifications;
create policy "own notifications read" on public.notifications as permissive for select to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "own notifications update" on public.notifications;
create policy "own notifications update" on public.notifications as permissive for update to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles as permissive for select to authenticated
  using ((id = ( SELECT auth.uid() AS uid)));
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles as permissive for update to authenticated
  using ((id = ( SELECT auth.uid() AS uid)))
  with check ((id = ( SELECT auth.uid() AS uid)));
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "see own reactions" on public.reactions;
create policy "see own reactions" on public.reactions as permissive for select to authenticated
  using (((( SELECT auth.uid() AS uid) = from_user) OR (( SELECT auth.uid() AS uid) = to_user)));
drop policy if exists "send reactions" on public.reactions;
create policy "send reactions" on public.reactions as permissive for insert to authenticated
  with check (((from_user = ( SELECT auth.uid() AS uid)) AND public.connected(from_user, to_user)));
drop policy if exists "logs own delete" on public.routine_logs;
create policy "logs own delete" on public.routine_logs as permissive for delete to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "logs own write" on public.routine_logs;
create policy "logs own write" on public.routine_logs as permissive for insert to authenticated
  with check (((user_id = ( SELECT auth.uid() AS uid)) AND (public.routine_role(routine_id) = ANY (ARRAY['owner'::text, 'accepted'::text]))));
drop policy if exists "logs visible" on public.routine_logs;
create policy "logs visible" on public.routine_logs as permissive for select to authenticated
  using ((public.routine_role(routine_id) = ANY (ARRAY['owner'::text, 'accepted'::text])));
drop policy if exists "members leave" on public.routine_members;
create policy "members leave" on public.routine_members as permissive for delete to authenticated
  using (((user_id = ( SELECT auth.uid() AS uid)) OR (public.routine_role(routine_id) = 'owner'::text)));
drop policy if exists "members visible" on public.routine_members;
create policy "members visible" on public.routine_members as permissive for select to authenticated
  using ((public.routine_role(routine_id) IS NOT NULL));
drop policy if exists "routines own delete" on public.routines;
create policy "routines own delete" on public.routines as permissive for delete to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "routines own insert" on public.routines;
create policy "routines own insert" on public.routines as permissive for insert to authenticated
  with check ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "routines own update" on public.routines;
create policy "routines own update" on public.routines as permissive for update to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "routines visible" on public.routines;
create policy "routines visible" on public.routines as permissive for select to authenticated
  using ((public.routine_role(id) IS NOT NULL));
drop policy if exists "own session status" on public.session_status;
create policy "own session status" on public.session_status as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "own spotify" on public.spotify_tokens;
create policy "own spotify" on public.spotify_tokens as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "own stuck" on public.stuck_points;
create policy "own stuck" on public.stuck_points as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "friends live" on public.study_live;
create policy "friends live" on public.study_live as permissive for select to authenticated
  using ((public.connected(( SELECT auth.uid() AS uid), user_id) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = study_live.user_id) AND COALESCE(((p.share ->> 'study'::text))::boolean, false))))));
drop policy if exists "own live" on public.study_live;
create policy "own live" on public.study_live as permissive for all to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "users manage their own study prefs" on public.study_prefs;
create policy "users manage their own study prefs" on public.study_prefs as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "own updates change" on public.updates;
create policy "own updates change" on public.updates as permissive for update to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "own updates read" on public.updates;
create policy "own updates read" on public.updates as permissive for select to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "own courses" on public.user_courses;
create policy "own courses" on public.user_courses as permissive for all to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "invited events" on public.user_events;
create policy "invited events" on public.user_events as permissive for select to authenticated
  using (public.invited_to(id));
drop policy if exists "own events" on public.user_events;
create policy "own events" on public.user_events as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));
drop policy if exists "own watched" on public.video_watched;
create policy "own watched" on public.video_watched as permissive for all to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));

-- ---------- Grants ----------
-- Tables: Supabase's defaults (full access for anon/authenticated/service_role, limited by RLS) ...
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
-- ... except profiles: users may update only their own display fields, never status / is_admin.
revoke update on public.profiles from anon, authenticated;
grant update (avatar_color, avatar_emoji, bio, name, prefs, program, share, study_year, weekly_goal_minutes) on public.profiles to authenticated;

-- Internal (triggers, feed builders, push key): server only
revoke all on function public._apply_update(p_id uuid) from public, anon, authenticated;
grant execute on function public._apply_update(p_id uuid) to service_role;
revoke all on function public._courses_for(uid uuid) from public, anon, authenticated;
grant execute on function public._courses_for(uid uuid) to service_role;
revoke all on function public._feed_for(uid uuid) from public, anon, authenticated;
grant execute on function public._feed_for(uid uuid) to service_role;
revoke all on function public._first_name(uid uuid) from public, anon, authenticated;
grant execute on function public._first_name(uid uuid) to service_role;
revoke all on function public._notify(p_user uuid, p_actor uuid, p_kind text, p_title text, p_body text, p_url text, p_dedupe text) from public, anon, authenticated;
grant execute on function public._notify(p_user uuid, p_actor uuid, p_kind text, p_title text, p_body text, p_url text, p_dedupe text) to service_role;
revoke all on function public._on_follow() from public, anon, authenticated;
grant execute on function public._on_follow() to service_role;
revoke all on function public._on_invite() from public, anon, authenticated;
grant execute on function public._on_invite() to service_role;
revoke all on function public._on_join() from public, anon, authenticated;
grant execute on function public._on_join() to service_role;
revoke all on function public._on_reaction() from public, anon, authenticated;
grant execute on function public._on_reaction() to service_role;
revoke all on function public._on_routine_log() from public, anon, authenticated;
grant execute on function public._on_routine_log() to service_role;
revoke all on function public._on_routine_member() from public, anon, authenticated;
grant execute on function public._on_routine_member() to service_role;
revoke all on function public.claim_tick() from public, anon, authenticated;
grant execute on function public.claim_tick() to service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;
revoke all on function public.vapid_private(p_token text) from public, anon, authenticated;
grant execute on function public.vapid_private(p_token text) to service_role;

-- Signed-in users
revoke all on function public.admin_set_status(p_user uuid, p_status text) from public, anon, authenticated;
grant execute on function public.admin_set_status(p_user uuid, p_status text) to authenticated, service_role;
revoke all on function public.admin_users() from public, anon, authenticated;
grant execute on function public.admin_users() to authenticated, service_role;
revoke all on function public.answer_invite(p_event uuid, p_status text) from public, anon, authenticated;
grant execute on function public.answer_invite(p_event uuid, p_status text) to authenticated, service_role;
revoke all on function public.answer_routine(p_routine uuid, p_accept boolean) from public, anon, authenticated;
grant execute on function public.answer_routine(p_routine uuid, p_accept boolean) to authenticated, service_role;
revoke all on function public.apply_update(p_id uuid) from public, anon, authenticated;
grant execute on function public.apply_update(p_id uuid) to authenticated, service_role;
revoke all on function public.catalog_add_course(p jsonb) from public, anon, authenticated;
grant execute on function public.catalog_add_course(p jsonb) to authenticated, service_role;
revoke all on function public.follow_answer(p_follower uuid, p_accept boolean) from public, anon, authenticated;
grant execute on function public.follow_answer(p_follower uuid, p_accept boolean) to authenticated, service_role;
revoke all on function public.follow_request(p_user uuid) from public, anon, authenticated;
grant execute on function public.follow_request(p_user uuid) to authenticated, service_role;
revoke all on function public.friend_view(p_user uuid) from public, anon, authenticated;
grant execute on function public.friend_view(p_user uuid) to authenticated, service_role;
revoke all on function public.invite_to_event(p_event uuid, p_users uuid[]) from public, anon, authenticated;
grant execute on function public.invite_to_event(p_event uuid, p_users uuid[]) to authenticated, service_role;
revoke all on function public.mark_notifications_read() from public, anon, authenticated;
grant execute on function public.mark_notifications_read() to authenticated, service_role;
revoke all on function public.my_badges() from public, anon, authenticated;
grant execute on function public.my_badges() to authenticated, service_role;
revoke all on function public.names_for(p_ids uuid[]) from public, anon, authenticated;
grant execute on function public.names_for(p_ids uuid[]) to authenticated, service_role;
revoke all on function public.people(p_query text) from public, anon, authenticated;
grant execute on function public.people(p_query text) to authenticated, service_role;
revoke all on function public.share_routine(p_routine uuid, p_users uuid[]) from public, anon, authenticated;
grant execute on function public.share_routine(p_routine uuid, p_users uuid[]) to authenticated, service_role;
revoke all on function public.vapid_init(p_public text, p_private text) from public, anon, authenticated;
grant execute on function public.vapid_init(p_public text, p_private text) to authenticated, service_role;

-- Calendar feed (Google fetches it without a session; token-checked)
revoke all on function public.calendar_feed(p_token text) from public, anon, authenticated;
grant execute on function public.calendar_feed(p_token text) to anon, service_role;

-- Token-checked machine endpoints (Apps Script, push tick)
revoke all on function public.ingest_mail(p_token text, p_mail jsonb) from public, anon, authenticated;
grant execute on function public.ingest_mail(p_token text, p_mail jsonb) to anon, authenticated, service_role;
revoke all on function public.ingest_note(p_token text, p_note jsonb) from public, anon, authenticated;
grant execute on function public.ingest_note(p_token text, p_note jsonb) to anon, authenticated, service_role;
revoke all on function public.mail_rules_apply(p_token text, p_gmail_id text, p_category text, p_summary text, p_actions jsonb, p_updates jsonb) from public, anon, authenticated;
grant execute on function public.mail_rules_apply(p_token text, p_gmail_id text, p_category text, p_summary text, p_actions jsonb, p_updates jsonb) to anon, authenticated, service_role;
revoke all on function public.opal_feed_url(p_token text) from public, anon, authenticated;
grant execute on function public.opal_feed_url(p_token text) to anon, authenticated, service_role;
revoke all on function public.opal_replace(p_token text, p_events jsonb, p_status text) from public, anon, authenticated;
grant execute on function public.opal_replace(p_token text, p_events jsonb, p_status text) to anon, authenticated, service_role;
revoke all on function public.private_feed(p_token text) from public, anon, authenticated;
grant execute on function public.private_feed(p_token text) to anon, authenticated, service_role;
revoke all on function public.push_mark(p_token text, p_key text, p_dead_endpoint text) from public, anon, authenticated;
grant execute on function public.push_mark(p_token text, p_key text, p_dead_endpoint text) to anon, authenticated, service_role;

-- Helpers used inside RLS policies (default: everyone)
revoke all on function public.connected(a uuid, b uuid) from public, anon, authenticated;
grant execute on function public.connected(a uuid, b uuid) to public, anon, authenticated, service_role;
revoke all on function public.current_semester() from public, anon, authenticated;
grant execute on function public.current_semester() to public, anon, authenticated, service_role;
revoke all on function public.invited_to(p_event uuid) from public, anon, authenticated;
grant execute on function public.invited_to(p_event uuid) to public, anon, authenticated, service_role;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to public, anon, authenticated, service_role;
revoke all on function public.is_approved(uid uuid) from public, anon, authenticated;
grant execute on function public.is_approved(uid uuid) to public, anon, authenticated, service_role;
revoke all on function public.routine_role(p_routine uuid, uid uuid) from public, anon, authenticated;
grant execute on function public.routine_role(p_routine uuid, uid uuid) to public, anon, authenticated, service_role;
revoke all on function public.vapid_public() from public, anon, authenticated;
grant execute on function public.vapid_public() to public, anon, authenticated, service_role;

-- ---------- Storage: private 'books' bucket (PDF chapters, 50 MB each) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('books', 'books', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "delete own book files" on storage.objects;
create policy "delete own book files" on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'books'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
drop policy if exists "read own book files" on storage.objects;
create policy "read own book files" on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'books'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
