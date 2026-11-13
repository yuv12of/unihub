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

## DEGREE PLAN (1.11.2026, 0032)
/degree "תכנית התואר" (nav, study group). degree_plans (one jsonb row per user, owner RLS). src/lib/degree.ts (pure): program AF rules (120 total, ≥111 science, ≥76 CS, ≥28 CS advanced, ≥24 advanced, ≤36 opening, math 35 all mandatory, CS core 42, CS electives ≥28, 1 seminar + 1 workshop, English content courses per settings), course catalog with prerequisites (needs = AND of OR-groups), minCs/minCredits, biblio, afterAdvanced, approval, offered pattern + known offerings (course-requirements 2025א–2027א and Sheilta offer search 2027ב/ג, fetched 1.11). itemIssues (prereq / offering / thresholds / biblio), requirements, totals, actions (to-dos), autoPlan (per-semester best subset under the credit cap, weighted by dependency depth + single-term offering). DegreePlanner.tsx: summary + finish semester vs target, to-dos, semester columns (drag or select to move), unplaced pool + add from the program list, requirement bars, settings. Tests src/lib/__tests__/degree.test.ts.
Owner's plan (Sheilta draft 395269 + agreed swaps: 20554 replaces 20562 because 20937 needs it; 20954 English seminar replaces 20368 for the 2nd English content course; later 20229 → 2028א, 20466 → 2027ב, 20554 → 2028ב; 20905 then needs לוגיקה to count as CS for its 36-credit rule — confirm with an advisor): 2027ב 20475 20417 20466 · 2028א 20425 20604 20229 · 2028ב 20594 20554 20905 20942 · 2029א 20551 20580 20944 20954 · 2029ב 20937 20973 (swapped 1.11 after the official table: 20937 runs ב+ג only). Totals 120 / CS 76 / electives 28 (no slack). OPEN: bibliographic training not done (needed before 2028א advanced courses); confirm with an advisor how the English exemption was obtained (2 content courses rule for students from 2022); update the Sheilta draft to match.

## DEGREE PLAN 2 (1.11.2026, 0033 applied): Sheilta sync, registration, scenarios, exam load, average
- OFFERINGS now from the official two-year table (www3.openu.ac.il/ouweb/owal/kursim.draw_form, POST windows-1255, departments 321+322, 2027א–2028ג): inside the range offered-or-not (error), beyond it the table's terms = "usually" (warn). Found: 20937 runs ב+ג only (plan had it in 2029א → warning).
- SHEILTA SYNC (lib/sheilta.ts): Sheilta's own JSON endpoint /Main/api/coursesApi/get (courseId, semester, innerStudentCourse.studyStatus.calculatedStatusCode 1 הצלחה / 2 בלימוד / 4 הרשמה מחדש / 13 אי עמידה, finalGrade, examGrade, points). Bookmarklet (bookmarklet(origin)) runs on Sheilta, opens /degree/sync#d=<compact rows>; the page calls importSheilta (no password stored, nothing sent by the browser to our server except via the signed-in action). Paste fallback (raw endpoint JSON). applySync: pass → done + grade (adds AF courses / outside courses with credits); latest attempt failed while planned at/before it → unplaced + failedIn; registered + unplaced → placed. Applied to main + every scenario. degree_plans.sheilta = {syncedAt, records}.
- REGISTRATION (lib/registration.ts, data/registration.json from openu.ac.il/registration/sesoneanddates): windows 2027א/ב/ג published; later = same term shifted by 364·k days (estimated). registrationStates → /degree #registration panel (✓/✗/? per planned course, extras with "add/move" buttons) + Today DegreeTodayCard (section key "degree"; also a grades-sync nudge from 3 weeks into the exams). Push (tick, degree_feed RPC for the caller, admin select for others): reg|S|open (day it opens), |week (7 days before regular end), |last, |late — only while planned courses aren't registered; 09:30–21:00; rough days only last/late.
- SCENARIOS: degree_plans.scenarios [{id,name,plan}] ≤5; chips on /degree, copy of the shown plan, rename/delete/promote (old main kept as "התכנית הקודמת"); DegreeCompare (finish, failing reqs, errors, heaviest semester, max exams, projected average, credits per semester, planDiff).
- EXAM LOAD (lib/examLoad.ts, data/exam-sittings.json from yedion2027/exams/bhinot.aspx): course.exam (all בחינת כיתה except seminars/workshops); estimated level by count vs. מועד א׳ window (4 busy, 5+ heavy), real gaps once exams rows exist (≤4 days close, ≤2 heavy). Badge per semester column + to-do lines.
- AVERAGE (lib/grades.ts): OU rule (yedion/procedure/finals.aspx): credits; advanced + seminars ×1.5; recognized studies excluded; honors 85+/top 20%, high honors 90+/top 20% of those; needed average for settings.gradeTarget; expected grades per remaining course (item.expected) → projection.
- Tests: src/lib/__tests__/degreeSync.test.ts (+ degree.test.ts updated).

MODULES (13.11, branch modules-phase0, no migration): Unihub for non-students, phase 0 of the plan in the claude.ai project doc LIFE-MODE-PLAN. profiles.prefs.modules {study, goals, hobbies}; missing key = default (study on, hobbies on, goals off) so old accounts are unchanged. lib/modules.ts (client-safe): modulesOf, pathAllowed/moduleOfPath (study = /courses /study /books /degree /mail /log /meetup), STUDY_TODAY_KEYS, tabsFor/defaultTabs, isStudyPush (s| d| mf|), MODE_PRESETS, GOALS_BUILT=false (flip when /goals ships; hides the goals switch and tab until then). saveModules action (stores the full set; saveLook never touches modules). Nav + TabBar filter by modules; proxy redirects a page of an off module to /?off=<module> (ModuleOffNote on Today); Today hides study sections through the existing hidden set and the unkeyed study cards; ModePicker on Today for accounts with no choice and no courses (לימודים / מטרות וחיים / גם וגם); Settings tab "כללי" (#modules) with ModuleSwitches, the "זמני לימוד" tab is hidden when study is off; FirstSteps per mode; QuickLog FAB and the sidebar semester label are students only; push tick drops study/deadline/degree/pace pushes for study-off users (lookup failure = treated as student). Tests: src/lib/__tests__/modules.test.ts. STILL OPEN in phase 0: profile page (program/year, stat tiles), badge groups, "weekly focus goal" wording, the separate league for non-students (phase 2).

GOALS (13.11, branch modules-phase0, migration 0039_goals.sql NOT APPLIED): tables goals / goal_milestones / tasks (goal_id null = plain task; repeat + source reserved for moving routine to-dos here) / goal_logs, owner RLS. lib/goalMeta.ts (client-safe, pure: progressAt for the 4 modes tasks|milestones|number|manual, series, spark, projectedFinish = pace of the last 28 days, plannedNow, stalledDays ≥10, nextStep, todaySteps, goalPushes, TEMPLATES, WIP_LIMIT 4) + lib/goals.ts (loadGoals(sb, userId?) returns empty if the tables are missing; getGoals; demo data under UNIHUB_DEMO). app/goalActions.ts (createGoal, updateGoal, deleteGoal, logGoal = one value/percent per day, tasks, milestones), wrapped in app/act.ts. /goals (week strip "N מתוך M מטרות התקדמו", GoalNew with templates, GoalBoard = status tabs on phone / 4 columns from xl, loose tasks) and /goals/[id] (GoalChart actual/planned/projected, 3 tiles, update form, milestones, tasks, settings). components/GoalViz.tsx (ProgressRing, Spark, GoalChart), GoalParts.tsx. Today: GoalsToday card "הצעד הבא" (hide key "goals"); calendar: goal/milestone/task dates as all-day items; tick: goalPushesFor (gd| step due tomorrow from 18:00, gs| stalled on day 10 then every 7). Nav item מטרות (module goals); GOALS_BUILT = true; userdata.getModules() (UNIHUB_DEMO shows all modules, UNIHUB_DEMO=life the non-student app). NOT BUILT: drag between columns, focus timer on a goal (goal_logs.minutes is ready), weekly time as a routine (goals.weekly_minutes/routine_id are ready), goals badges, the non-student league, weekly review, shared goals. Tests: src/lib/__tests__/goals.test.ts. UI v2 proposal: claude.ai project doc UI-V2.

GOALS 2 (13.11, migrations 0039 + 0040 APPLIED): goal_logs.routine_date; RPC focus_minutes(p_user) → {study, days} (minutes per day on goals + hobbies, for me or someone I follow who shares hours; security definer, authenticated only). Time on a goal: GoalTime on /goals/[id] (FocusTimer 25/45/60 → logGoalTime, quick log chips, weekly slider → setGoalWeekly = flexible routine category habit, like hobbies; toggleRoutine logs/removes goal time via routine_date; updateGoal keeps the routine's name/active in step; deleteGoal removes it). Board: cards drag between columns from xl (optimistic, reverts on error). Badges: group "goals" (step1, step25, goal1, goal5, moving3, comeback, focus10) from goalBadgeStats; study + course badges are not computed when student mode is off. Friends: two leagues (students by study minutes; others by focus minutes; a friend appears only in the league of their kind), heatmap follows; share box "שעות" covers both. Profile: non-student tiles (focus this week, goals active/done), "ימי פעילות" heatmap, program/year hidden in the editor. Quick add: a line starting with "משימה" is a task (parseTask: optional day/date = due, "למטרה <name>" ties it to a goal); only when the goals module is on. userdata.getFocus(id). Tests: goals.test.ts, quickTask.test.ts. Still open: weekly review, shared goals, balance view, friend profile page for non-students (still shows study framing).
