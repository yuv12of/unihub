-- Practice: one log of practice attempts (book questions, mix, pretest/check, drills) and the
-- "question for the tutor" written from a stuck point. Idempotent; RLS: own rows only.

create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- question: a book question answered in /study · mix: in the mixed bag · pretest / check: before
  -- reading and after finishing a chapter · drill: a generated drill
  kind text not null check (kind in ('question', 'mix', 'pretest', 'check', 'drill')),
  course_code text,
  question_id uuid references public.book_questions(id) on delete cascade,
  chapter_id uuid references public.book_chapters(id) on delete cascade,
  -- drill name (heap, build, bst, chain, probe, rref, det, deriv, limit)
  drill text,
  -- solved / stuck / skipped for questions; for drills: correct on the first try
  result text,
  correct boolean,
  -- mix: picked the right chapter ("which method is this?")
  picked_ok boolean,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists practice_attempts_user_time on public.practice_attempts (user_id, created_at desc);
create index if not exists practice_attempts_chapter on public.practice_attempts (user_id, chapter_id) where chapter_id is not null;
alter table public.practice_attempts enable row level security;
drop policy if exists "own practice attempts" on public.practice_attempts;
create policy "own practice attempts" on public.practice_attempts
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.stuck_questions (
  stuck_id uuid primary key references public.stuck_points(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tried text not null default '',
  where_stuck text not null default '',
  -- /books/<id>?ch=<idx>&p=<page>, when the stuck point came from a book question
  book_href text,
  question_id uuid references public.book_questions(id) on delete set null,
  -- where it was asked: phone / forum / mail / meetup
  asked_via text check (asked_via in ('phone', 'forum', 'mail', 'meetup')),
  updated_at timestamptz not null default now()
);
create index if not exists stuck_questions_user on public.stuck_questions (user_id);
alter table public.stuck_questions enable row level security;
drop policy if exists "own stuck questions" on public.stuck_questions;
create policy "own stuck questions" on public.stuck_questions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
