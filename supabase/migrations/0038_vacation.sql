-- A vacation: several days off in a row, stored like any rest day (one row a day) so the planner,
-- reminders and streaks treat it the same, with its own reason to show and cancel it as one.
alter table public.day_off drop constraint if exists day_off_reason_check;
alter table public.day_off add constraint day_off_reason_check check (reason = any (array['sick', 'reserve', 'family', 'other', 'vacation']));
