# Core Group Dashboard — Project Handoff

A read/write reporting + management dashboard for **The Ear Academy**, showing
usage & engagement across 12 partner schools, pulled from four data sources.

This document is the single place to resume the project. Everything below
reflects the state as of this handoff.

---

## 1. Where everything lives

| Thing | Location |
|---|---|
| **Source code (canonical)** | GitHub: `TheEar2026/Core-Group-Dashboard`, branch `main` |
| **Live app** | https://core-group-dashboard.vercel.app |
| **Hosting** | Vercel project `the-ear-academy/core-group-dashboard` — auto-deploys on every push to `main` (Git integration). PRs get preview URLs. |
| **Database / Auth** | Supabase project ref `uvxpngmnczixgkzhvaly` (region eu-west-1), name "The Core Group - Dashboard" |

**This zip is a snapshot.** GitHub is the source of truth — if in doubt, clone
from there. To continue in a fresh environment you can either clone the repo or
unzip this and `git init` / re-point the remote.

---

## 2. Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript**
- **Tailwind CSS v4**, Inter font, brand theming via CSS variables (light + dark)
- **Supabase** — Postgres + Auth + Row Level Security, via `@supabase/ssr`
- Auth: email/password. `src/proxy.ts` refreshes the session and guards routes
  (Next 16 renamed `middleware` → `proxy`).
- No other backend. The app reads/writes Supabase through `public`-schema RPCs.

## 3. Run locally

```bash
npm install
# create .env.local (see .env.example) — the two NEXT_PUBLIC values are enough
npm run dev            # http://localhost:3000
npm run build          # production build / typecheck
```

`.env.local` needs only:
```
NEXT_PUBLIC_SUPABASE_URL=https://uvxpngmnczixgkzhvaly.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key — safe for the browser>
```
(The anon key is in `.env.example` / the committed `.env.local` in this zip.
It is a public client key, not a secret.)

## 4. Test login

```
Email:    test-admin@theearacademy.com
Password: CoreGroup2026!Test
```
This is a **super-admin** account (sees all 12 schools + the Manage section).
It's a persistent test user — fine to keep or delete later.

---

## 5. Secrets — NOT included in this zip (by design)

You must supply these yourself to do admin/deploy tasks; get them from the
respective dashboards:

| Secret | Where | Used for |
|---|---|---|
| Supabase **service_role** key | Supabase → Project Settings → API | Server-side admin (e.g. creating auth users) |
| Supabase **Management API PAT** (`sbp_…`) | supabase.com/dashboard/account/tokens | Applying SQL migrations via the Management API |
| **Vercel** token (`vcp_…`) | vercel.com/account/tokens | CLI deploys (normally unnecessary — Git push auto-deploys) |

None of these are in the repo or this zip. Only the public anon key is.

---

## 6. The data model (read this first)

Four sources, all joining on **two spines**: `school_id` (every source) and
`person_id` (the two person-level sources).

| Source | Grain | → school via | → person via |
|---|---|---|---|
| **Drive Ed** | per-school/day | `schools.drived_core_id` | — |
| **Vimeo** | per-school | `schools.vimeo_source_url` (domain) | — |
| **Product Fruits** | per-person | `schools.product_fruits_school_name` | email |
| **LMS** (scraped per school) | per-teacher/course | LMS `course_url` domain → `vimeo_source_url` | teacher name |

**Postgres schemas:** `identity` (people, schools, *_users, teaching_assignments,
person_source_map, match_review_queue), `staging` (stg_* raw loads), `fact`
(cleaned: school_usage_daily, school_video_engagement, product_fruits_activity,
lms_completions), `reporting` (views: v_school_report, v_school_trend,
v_teacher_report).

- All 12 schools have their per-source keys populated → school joins work.
- `identity.people.canonical_full_name` is a **GENERATED** column
  (`TRIM(first_name || ' ' || surname)`) — never insert it directly.
- Primary keys are `GENERATED ALWAYS AS IDENTITY` — never insert `id`.

### Current data state (sparse — important)
The pipeline/schema are correct but ingestion is early:
- **Drive Ed**: real per-school `users` headcounts; funnel columns mostly 0.
- **Vimeo**: rows exist per school but all engagement metrics are 0.
- **LMS**: course catalog + lesson totals present; completions 0; teacher names
  scraped **only for Sky City** so far.
- **Product Fruits**: 3 activity rows.
- **Identity matching**: 1 LMS teacher resolved (Anita Visser); **18 still
  pending** in Match Review (all Sky City). Product Fruits `school_id` backfill
  available but not yet run.

---

## 7. App pages

| Route | Who | What |
|---|---|---|
| `/login` | public | Email/password sign-in |
| `/dashboard` | all roles | School Report table (all sources); school name links to trend |
| `/schools/[id]` | admins | School trend: KPI cards + time-series charts |
| `/teachers` | admins | Teacher report: searchable/sortable; row → detail |
| `/teachers/[id]` | admins | Teacher detail: login timeline + lesson progress cards |
| `/courses/[key]` | admins | Course completion across teachers |
| `/manage` | super admin | Create schools/teachers, assign to school + course |
| `/manage/matches` | super admin | Identity match review (resolve source names → people) |

UI shell: `src/components/app-shell.tsx` (collapsible sidebar + dark-mode toggle,
both persisted to localStorage; "Manage" link shows only for super admins).

## 8. Public RPCs (all in `supabase/migrations/`)

Reads: `get_my_role`, `get_my_school_report`, `get_my_teacher_report`,
`get_my_school_trend`, `get_teacher_login_activity`,
`get_teacher_lesson_progress`, `get_course_completion`.

Admin (super-admin gated): `admin_list_schools/teachers/assignments`,
`admin_create_school`, `admin_create_teacher`, `admin_assign_teacher_school`,
`admin_assign_course`, `admin_list_match_queue`, `admin_match_create_teacher`,
`admin_match_link_existing`, `admin_match_create_all`,
`admin_match_resolve_to_person`, `admin_backfill_pf_schools`.

Every RPC that scopes data does so on `identity.is_super_admin()` /
`identity.my_school_ids()` / `identity.my_person_id()`. Only the `public` schema
is exposed over PostgREST, so all DB access goes through these RPCs.

### Applying migrations
SQL files under `supabase/migrations/` were applied to the live DB via the
Supabase **Management API** (`POST /v1/projects/<ref>/database/query`) during
development. You can keep doing that, or use `supabase db push` with the CLI.
They are ordered by timestamp filename.

---

## 9. Status — done vs. remaining

**Done**
- Auth + session + route guard; The Ear Academy branding (real logo) light/dark
- Dashboard, School Trend, Teacher Report, Teacher Detail, Course Detail
- Collapsible menu + dark mode
- Super-admin management (create schools/teachers, assign school + course)
- Identity match-review tool (LMS names → people, backfills completions)
- Deployed on Vercel with Git auto-deploy

**Remaining / next**
- **School-admin scope change**: make school admins see all 12 schools
  (read-only). Currently they're scoped to their own school. This is a decided
  change not yet implemented — update the report RPCs' WHERE clauses to also
  allow a school-admin check, and confirm they don't get Manage.
- **Resolve the 18 pending LMS matches** (one click: "Create all pending").
- **Run the Product Fruits school backfill** (button on Match Review).
- **Data ingestion**: the `staging → fact` population + the per-school LMS
  scrape are external to this app. Getting real completion/engagement numbers
  in is the highest-leverage thing to make the dashboard look alive.
- Optional from the original plan: manual LMS CSV import UI, magic-link login,
  an Admin data-freshness page (needs a sync-log source), mobile QA pass.

## 10. Conventions
- Commit to `main` → auto-deploys. Never commit secrets (only the public anon
  key appears in the repo).
- Status colours are traffic-light (green ≥80 / amber 60–79 / red <60) and are
  intentionally the same in light & dark; only surfaces/text flip for dark mode.
- Brand gold is `#A8884C`.
