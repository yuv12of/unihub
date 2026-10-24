-- Keep the formatted (HTML) version of university mail so images and links display properly.
alter table public.mails add column if not exists body_html text;
-- ingest_mail(): see the function body applied in Supabase (stores `html`, and back-fills body_html for
-- mails that were already stored without it). Kept in sync with 0004 otherwise.
