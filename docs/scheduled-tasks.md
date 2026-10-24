# Scheduled tasks

Unihub has no Claude API key. Everything that needs AI runs in the owner's scheduled Claude tasks, which
read and write the Supabase project (`aajoigtmsvtzcehrnzvz`) with SQL.

| Task | When | What |
|---|---|---|
| `trig_01D196ZFdNdjMGTezSj9FyPx` | daily 05:25 | chapter summaries, key points, questions, practice cards (6 chapters a day) |
| (new step in the same task) | daily 05:25 | **overnight marking of handwritten practice**, below |

## Overnight marking of handwritten practice (new step for the 05:25 task)

Needs migration `0022_automation.sql` (table `practice_marks`). Add the text below as the last step of the
05:25 task prompt. It is written to be pasted as is.

**How the owner uses it:** in Notability, solve a practice exercise on a note titled
`תרגול <course code> <exercise>` (for example `תרגול 20109 3.2`), or a past-exam question on a note titled
`מבחן <course code> <exam and question>` (for example `מבחן 20407 2025א מועד 81 שאלה 2`). The note syncs to
Google Drive, and the Apps Script puts it in the `notes` table (`name`, `folder`, `course_code`, `url`,
`text_content`). The next morning, feedback is on Today ("משוב על התרגול שלך") and in /study.

### Prompt text

```
STEP: MARK HANDWRITTEN PRACTICE (owner only: user_id ffc91068-ed7d-45bf-8f81-73f67d0f6cfd)

Goal: by morning, every new practice page has short feedback: whether it is right, the first line that goes
wrong, and ONE hint toward fixing it. Never write the full solution, never write the corrected line.

1. Find new practice notes:
   select n.id, n.name, n.folder, n.course_code, n.url, n.text_content, n.modified_at
   from notes n
   where n.user_id = 'ffc91068-ed7d-45bf-8f81-73f67d0f6cfd'
     and n.name ~ '^\s*(תרגול|מבחן)\s+\d{5}'
     and n.modified_at > now() - interval '3 days'
     and not exists (select 1 from practice_marks m
                     where m.note_id = n.id and m.created_at >= n.modified_at)
   order by n.modified_at
   limit 8;
   If there are none, skip this step.

2. Integrity rules (check before reading anything):
   - Only practice exercises from the course books and past exams. The note name must start with
     "תרגול" or "מבחן".
   - If the name, folder or page content mentions a live assignment (ממ"ן / ממ"ח / מטלה with a number,
     or an assignment of the current semester 2027א), do NOT mark it. Insert one row with verdict
     'unclear', page 1 and feedback 'לא נבדק: נראה כמו מטלה להגשה. בודקים רק תרגול ומבחנים קודמים.'
     and move on.

3. Read the page. Open the note's PDF from Google Drive (n.url) and look at each page as an image:
   handwriting and math are only reliable from the image. Use n.text_content (Apps Script OCR) only as
   a fallback hint, never as the source. If you cannot open the file at all, insert one row with
   verdict 'unclear' and feedback 'לא הצלחתי לפתוח את הדף. כדאי לבדוק שהקובץ בתיקיית Notability ב-Drive.'
   Find the exercise itself: the book exercise named in the note (course code + number, e.g. 20109 3.2;
   search the book_chapters/book_questions of that course) or the exam question written on the page.

4. For each page with a solution attempt, decide:
   - verdict 'correct': the reasoning and the result hold. Feedback: one sentence on what was done well
     or a small style point (e.g. "נימוק מלא; אפשר לקצר את שלב 3").
   - verdict 'error': quote the FIRST line that goes wrong exactly as written (first_wrong_line, plain
     text math like A^-1, x_1, sum), and write a hint in Hebrew, 1–2 sentences, that points at the
     mistake without fixing it ("בדוק/י את הסימן כשמעבירים אגף בשורה הזו", "איזה תנאי של המשפט לא
     בדקת?"). One hint per page, the earliest problem only.
   - verdict 'unclear': the handwriting can't be read or there is no attempt. Say what to fix.
   Plain, short Hebrew. No full solutions, no final answers, no corrected lines.

5. Write one row per page (idempotent; re-marking a changed note replaces the old feedback):
   insert into practice_marks (user_id, note_id, page, course_code, exercise, verdict, first_wrong_line, feedback)
   values ('ffc91068-ed7d-45bf-8f81-73f67d0f6cfd', '<note id>', <page>, '<course code from the name>',
           '<exercise from the name, e.g. 3.2>', '<correct|error|unclear>', <quoted line or null>, '<hint>')
   on conflict (note_id, page) do update
     set verdict = excluded.verdict, first_wrong_line = excluded.first_wrong_line,
         feedback = excluded.feedback, exercise = excluded.exercise,
         created_at = now(), seen = false;
   Escape single quotes in text by doubling them.

6. If a page had an error, also add a stuck point so the planner weights that course:
   insert into stuck_points (user_id, course_code, topic)
   values ('ffc91068-ed7d-45bf-8f81-73f67d0f6cfd', '<course code>', 'תרגול <exercise>: <the hint, shortened>');
   (Skip if an unresolved stuck point with the same topic exists.)

7. In the task's final report, add one line: "תרגול: N דפים נבדקו (X נכונים, Y עם טעות, Z לא ברורים)".
```

### Checking it worked

```sql
select n.name, m.page, m.verdict, m.first_wrong_line, m.feedback, m.created_at
from practice_marks m join notes n on n.id = m.note_id
order by m.created_at desc limit 10;
```

**First small step:** write one solved exercise in Notability as `תרגול 20109 1.1`, wait for it to appear in
`notes`, then run the task once by hand and check the row and the card on Today.

## Exam dates published (fallback step for the 05:25 task)

Needs migration `0023_exam_candidates.sql`. The app already looks for exam dates in two places:
the mail ingest (`/api/ingest/mail`, using the attachment text the Apps Script sends) and the push tick
(`scanExamMails`, every tick for the last 3 days of mail after PDF attachments get their text, and a
120-day safety scan on Saturday 21:00–21:15). Both only add rows to `exam_candidates`; the user accepts
each date on Today ("מועדי הבחינות פורסמו"). This step catches what the deterministic parser misses
(new layouts, scanned PDFs without a text layer, dates written in prose).

### Prompt text

```
STEP: EXAM DATES (owner only: user_id ffc91068-ed7d-45bf-8f81-73f67d0f6cfd, semester 2027א)

Goal: when the Open University publishes the 2027א exam dates (מועדי בחינות), they wait on Today for
approval. Never write to the exams table yourself.

1. Skip this step if all my 2027א courses already have exams rows for both מועד א and מועד ב:
   select c.course_code,
          bool_or(e.moed = 'א') has_a, bool_or(e.moed = 'ב') has_b
   from user_courses c left join exams e
     on e.user_id = c.user_id and e.course_code = c.course_code and e.semester = c.semester
   where c.user_id = 'ffc91068-ed7d-45bf-8f81-73f67d0f6cfd' and c.semester = '2027א'
   group by c.course_code;

2. Read mail of the last 4 days that may announce exam dates:
   select m.id, m.subject, m.received_at, m.body_text, a.filename, a.text_content
   from mails m left join mail_attachments a on a.mail_id = m.id
   where m.user_id = 'ffc91068-ed7d-45bf-8f81-73f67d0f6cfd'
     and m.received_at > now() - interval '4 days'
     and (m.subject ~ '(בחינ|מבחן|מועד|זימון)' or m.body_text ~ '(מועדי הבחינה|לוח בחינות|זימון לבחינה|מועד [אב])'
          or a.text_content ~ 'מועדי הבחינה');
   If an attachment is a PDF with empty text_content, open it (data_base64) and read it as an image.
   Sheilta's notice "הודעה על מועדי בחינות בקורסים" has a table: each course row has the course
   semester and code ("2027א 20109") and up to four dates; the code above each date says the מועד
   (א8, א3 = מועד א; ב1 = מועד ב). Moed א often has two dates: keep both.

3. Only my 2027א courses (step 1), only exam dates (not registration deadlines "תסגר בתאריך",
   not assignment deadlines). Moed is 'א', 'ב' or 'מיוחד'. start_time 'HH:MM' or null.

4. Insert, never update:
   insert into exam_candidates (user_id, course_code, semester, moed, date, start_time, mail_id)
   values ('ffc91068-ed7d-45bf-8f81-73f67d0f6cfd', '<code>', '2027א', '<moed>', '<YYYY-MM-DD>', <'HH:MM' or null>, '<mail id>')
   on conflict (user_id, course_code, semester, moed, date) do nothing;

5. If any row was inserted, also add one notification (the app pushes it to the phone):
   insert into notifications (user_id, kind, title, body, url)
   values ('ffc91068-ed7d-45bf-8f81-73f67d0f6cfd', 'exam_dates', 'מועדי הבחינות פורסמו',
           '<N> מועדים חדשים (<codes>). לבדוק ולהוסיף ללוח ב־Unihub.', '/');

6. In the final report: "בחינות: N מועדים חדשים" or "בחינות: אין חדש".
```
