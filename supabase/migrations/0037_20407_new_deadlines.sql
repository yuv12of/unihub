-- 20407 (מבני נתונים) 2027א: the course team moved ממ"ן 1 and 2 by a week
-- (פורום חדשות, יעל ברונר, 8.11.2026: "ממ"ן 1 – 19.11.26, ממ"ן 2 – 3.12.26"; the rest stay).
update public.assignments set due = '2026-11-19' where course_code = '20407' and semester = '2027א' and n = '01';
update public.assignments set due = '2026-12-03' where course_code = '20407' and semester = '2027א' and n = '02';
