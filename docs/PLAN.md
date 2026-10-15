# Unihub — University Smart Assistant: Starting Plan

_Drafted 2026-10-15_

## 1. Goal
A personal web app (usable on phone, iPad and PC) that acts as an AI study assistant for Open University courses:
- Builds and maintains a daily routine and shows the schedule
- Helps you learn from the actual course books and your own notes
- Tracks progress per course (chapters, assignments, exams)
- Pushes reminders and updates through Google Calendar and Gmail

## 2. Core features (MVP first, in order)
| # | Feature | What it does |
|---|---------|--------------|
| 1 | Courses & semester setup | Add courses, units/chapters, assignment (ממ"ן) and exam dates |
| 2 | Progress tracker | Mark chapters read/summarised/practised; % done per course; "behind schedule" warnings |
| 3 | Routine & schedule | Weekly availability -> AI builds a study plan that hits deadlines; daily "today" view |
| 4 | Google Calendar sync | Study blocks and deadlines written to a dedicated "Unihub" calendar |
| 5 | Course book Q&A | Upload course PDFs; ask questions, get answers with page citations; quiz/flashcard generation |
| 6 | Notability integration | Ingest your handwritten notes so the assistant knows what you've covered |
| 7 | Email digests | Morning "today's plan" + weekly progress email via Gmail |

## 3. How each integration realistically works
- **Notability:** it has no public API. Practical route: turn on Notability's auto-backup to Google Drive / OneDrive (as PDF). Unihub watches that folder, runs OCR/handwriting recognition on new pages, and indexes them alongside the course books.
- **Course books:** upload the course PDFs (from the course website) once per semester. They get split into chunks and embedded for search (RAG), so answers quote the real material. Hebrew text needs to be checked early (OCR quality, right-to-left UI).
- **Phone access:** build as a PWA (installable web app) — one codebase, works on iPhone/Android/iPad, supports push notifications.
- **Google Calendar & Gmail:** Google OAuth sign-in, then Calendar API and Gmail API (send-only scope for digests).
- **AI:** Claude API for planning, tutoring, summarising and quizzes.

## 4. Suggested tech stack
- **Frontend + backend:** Next.js (React, TypeScript) as a PWA
- **Database / auth / file storage:** Supabase (Postgres + pgvector for book search)
- **AI:** Claude API (Anthropic)
- **Hosting:** Vercel (free tier is enough to start)
- **Background jobs:** scheduled functions (daily plan, email digest, Notability folder sync)

Cost to start: roughly free, except Claude API usage (a few dollars/month for one person at normal use).

## 5. Phased roadmap
**Phase 0 — Setup (week 1)**
Repo, Next.js app, Supabase project, Google OAuth sign-in, deploy to Vercel, install on phone.

**Phase 1 — Organiser (weeks 2-3)**
Courses, chapters, deadlines, progress tracker, "Today" dashboard.

**Phase 2 — Planner (weeks 4-5)**
Availability input, AI-generated weekly plan, Google Calendar sync, rescheduling when you miss a session.

**Phase 3 — Study buddy (weeks 6-8)**
PDF upload + indexing, chat with citations, quizzes/flashcards, spaced-repetition review queue.

**Phase 4 — Notes & notifications (weeks 9-10)**
Notability backup ingestion, morning/weekly Gmail digests, push notifications.

## 6. Feature ideas for later
- Exam countdown mode: auto-shifts the plan toward revision as the exam nears
- Weak-spot detection from quiz results -> extra review sessions
- Assignment helper that explains concepts and checks your reasoning (without writing the answer for you)
- Pomodoro / focus timer that logs real study time against the plan
- Weekly reflection: "what went well, what slipped" -> plan adjusts
- Formula / definition sheet auto-built from each course
- Voice mode on the phone for quick questions on the go

## 7. Decisions (2026-10-15)
- University: Open University of Israel. Course data comes from Opal (opal.openu.ac.il, Moodle-based) behind SSO login.
- Books are in Hebrew: UI must be RTL-first; use Hebrew-capable PDF text extraction (fall back to OCR for scanned books); Claude handles Hebrew Q&A natively.
- Claude builds the app; user reviews.
- Courses and dates are detected automatically from Opal, not entered by hand.

## 8. Opal integration approach
Opal is Moodle, so the preferred route is Moodle's mobile web service (the same one the official app uses) with a per-user token: it exposes enrolled courses, calendar events (assignment/ממ"ן due dates), course contents and files. If the token route is blocked by the university's SSO, fallback is a scheduled sync that reads the pages with a logged-in session. Login details are entered by the user only, never stored in plain text.

## 9. Semester 2027א — detected from Opal (2026-10-15)
Full data: `data/semester-2027a.json`.

| Course | Code | Assignments | Required weight | First due |
|---|---|---|---|---|
| אלגברה לינארית 1 | 20109 | 8 (5 file, 3 online) | 11 min / 20 max | 19/11/2026 |
| חשבון אינפיניטסימלי 1 | 20474 | 11 (7 file, 4 online) | 10 min / 20 max | 12/11/2026 |
| מבני נתונים ומבוא לאלגוריתמים | 20407 | 6 (5 file + participation) | 15 min / 25 max; at least 3 of 01-05 | 12/11/2026 |

All three end in a classroom exam (dates not yet published). The busiest weeks are around 12/11, 26/11, 10/12 and 31/12, when several assignments are due within days of each other.

**Findings that affect the build**
- Due dates come from the public course-requirements page (`academic.openu.ac.il/course-requirements/course/{code}/semester/{sem}`), with no login needed. This is the simplest reliable sync source.
- Opal's own calendar API returns no events yet: course sites open only about a week before the semester starts. Re-sync then for tutorial times and assignment details.
- Course books are served through Opal's digital e-book viewer, not as plain PDF links. Getting the text into Unihub needs checking (export/print from the viewer, or the printed books scanned via the iPad). This is the main open risk for book Q&A.
