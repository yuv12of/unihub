-- 0028 study sessions moved by hand: { "<session key>": { "date": "YYYY-MM-DD", "start": "HH:MM", "minutes": 90 } }.
-- Lives with the study prefs so the calendar feed and push reminders (via _feed_for) plan the same way.
alter table public.study_prefs add column if not exists moves jsonb;
