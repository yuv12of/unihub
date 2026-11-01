-- 0032 import tokens: short-lived keys for importing a semester's assignment files from Opal
-- (a script run on the Opal page, logged in there, sends each file to /api/import/assignment).
-- Only the hash is kept; rows expire. Read only by the server (admin client): RLS on, no policies.
-- Idempotent.

create table if not exists public.import_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  purpose text not null default 'assignments' check (purpose in ('assignments')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists import_tokens_by_user on public.import_tokens (user_id);
alter table public.import_tokens enable row level security;
