-- The question/part headings an AI model found in a solution note (sent by the user's Apps Script,
-- which asks Gemini to list headings only, never to judge answers):
--   {"keys":["1א","1ב","3ב(1)"], "empty":["2ב"], "pages":8}
-- headings_for: the note version (modified_at) they were read from; a newer version makes them stale.
alter table public.notes
  add column if not exists headings jsonb,
  add column if not exists headings_for timestamptz,
  add column if not exists headings_error text;

create or replace function public.ingest_note_headings(p_token text, p_drive_id text, p_modified timestamptz, p_headings jsonb, p_error text)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare uid uuid; n int;
begin
  select t.user_id into uid from public.ingest_tokens t where t.token = p_token;
  if uid is null then raise exception 'bad token'; end if;
  update public.notes
     set headings = p_headings, headings_for = p_modified, headings_error = left(p_error, 500)
   where user_id = uid and drive_id = p_drive_id;
  get diagnostics n = row_count;
  return case when n > 0 then 'stored' else 'unknown note' end;
end; $function$;

revoke all on function public.ingest_note_headings(text, text, timestamptz, jsonb, text) from public, anon, authenticated;
grant execute on function public.ingest_note_headings(text, text, timestamptz, jsonb, text) to anon, authenticated, service_role;
