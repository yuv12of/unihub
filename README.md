# Unihub

Personal study assistant for the Open University of Israel: schedule, deadlines, progress and (soon) course-book Q&A. Hebrew, right-to-left, installable on phone and iPad.

The full product plan is in [`docs/PLAN.md`](docs/PLAN.md).

## Stack
- **Next.js 16** (App Router, Cache Components) + Tailwind 4, deployed on **Vercel**
- **Supabase** for database, Google sign-in and file storage
- The current semester is set in one place, `SEMESTERS` in `src/lib/semester.ts` (mirrored by the `semesters` table); demo course data lives in `src/data/semester-2027a.json`

## Run locally
```bash
npm install
cp .env.example .env.local   # fill in values (optional: without them the app runs without sign-in)
npm run dev
```

## One-time setup

### 1. Supabase
1. Create a project at supabase.com (region: closest to Israel, e.g. Frankfurt).
2. **SQL Editor** → on a fresh project run `supabase/migrations/0000_baseline.sql` (the whole schema: tables, functions, triggers, RLS policies, grants and the `books` storage bucket), then every later file in that folder in number order (0019, 0020…).
   `supabase/migrations/archive/` is history only: those files were applied to the live database before the baseline and are already included in it. Don't run them.
   Courses are added from the app (Settings → courses reads the official requirements page), so no seed data is needed.
   Every new schema change goes in a new numbered file, committed together with the code that needs it.
3. **Project Settings → API Keys**: copy the Project URL and the publishable key into the env vars below.

### 2. Google sign-in
1. In Google Cloud Console create a project → **APIs & Services → OAuth consent screen** (External, add your Gmail as a test user).
2. **Credentials → Create OAuth client ID** (Web application). Authorized redirect URI:
   `https://<your-project>.supabase.co/auth/v1/callback`
3. In Supabase: **Authentication → Sign In / Providers → Google**: enable, paste the client ID and secret.
4. In Supabase: **Authentication → URL Configuration**: Site URL = your Vercel URL; add redirect URLs
   `https://<your-app>.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`.

### 3. Vercel
Import the GitHub repo, then add the environment variables:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |

Once the Supabase variables are set, every page requires sign-in, and a new account waits on /pending until an admin approves it (`profiles.status`).

## Calendar sync
Settings → **סנכרון ליומן Google** creates a private iCal link (`/api/calendar/<token>`).
Add it in Google Calendar → Settings → Add calendar → From URL. It contains deadlines, exams and the study plan,
and Google refreshes it every few hours. Resetting the link invalidates the old one.

## University mailbox
Settings → **דואר מהאוניברסיטה** generates a Google Apps Script (with a personal token) that forwards only
`openu.ac.il` mail to `/api/ingest/mail` every 10 minutes. Mail is stored in `mails` / `mail_attachments`.
A scheduled Claude task (runs on the user's Claude subscription, via the Supabase connector) fills in
`summary`, `category`, `action_items` and reads exam dates from the exam-notice PDFs into `exams` (source `mail`).

## Study planner
`src/lib/planner.ts` is a pure function: availability + deadlines + exam dates → dated sessions.
Assignment prep happens in the 14 days before a deadline, exam revision in the 21 days before an exam,
and leftover time is optional routine study rotating between courses.

## Install on phone / iPad
Open the site in Safari → Share → **Add to Home Screen**.
