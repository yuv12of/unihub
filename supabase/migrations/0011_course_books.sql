-- Course books (applied 18.10.2026 as 0020_course_books). Private to the importing account.
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_code text not null,
  title text not null,
  source_path text,
  pages int not null default 0,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.book_chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idx int not null, title text not null, start_page int not null, end_page int not null,
  storage_path text not null, text_content text, summary text, key_points jsonb, processed_at timestamptz,
  last_page int, read_at timestamptz, done_at timestamptz,
  unique (book_id, idx)
);
create table if not exists public.book_questions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.book_chapters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idx int not null default 0, prompt text not null, hint text, answer text not null, page int,
  difficulty int not null default 2 check (difficulty between 1 and 3),
  status text check (status in ('solved','stuck','skipped')),
  created_at timestamptz not null default now()
);
alter table public.cards add column if not exists chapter_id uuid references public.book_chapters(id) on delete set null;
alter table public.cards add column if not exists page int;
alter table public.books enable row level security;
alter table public.book_chapters enable row level security;
alter table public.book_questions enable row level security;
create policy "own books" on public.books for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own book chapters" on public.book_chapters for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own book questions" on public.book_questions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('books', 'books', false, 52428800, array['application/pdf']) on conflict (id) do nothing;
create policy "read own book files" on storage.objects for select to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own book files" on storage.objects for delete to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = (select auth.uid())::text);
