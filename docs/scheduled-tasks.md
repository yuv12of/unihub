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
