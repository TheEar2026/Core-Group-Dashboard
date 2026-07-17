# Core Group Dashboard — Design Brief

For Google Stitch. This describes the product, the real data it displays, and the
screens to design. Field names throughout are the *actual* column names returned
by the app, so generated UI can map straight onto them.

## 1. Product overview

A web dashboard for **The Core Group** (an education organization) showing usage
and engagement data for 12 partner schools, pulled from three systems:

- **Drived** — daily tenant-level adoption counts (users invited/accepted/logged in/studied)
- **Product Fruits** — login/activity tracking
- **The Ear Academy LMS** — lesson and course completion

It's a **read-only reporting layer**: no data entry beyond one manual CSV import
(lesson completion, admin-only, later phase). Backend is Supabase (Postgres +
Auth + Row Level Security). Frontend is Next.js + Tailwind CSS.

## 2. Users & access levels

Three roles, enforced server-side (not just hidden in the UI):

| Role | Sees | Notes |
|---|---|---|
| **Super Admin** | All 12 schools | Full visibility, no filtering |
| **School Admin** | Only their own school(s) | Most admins have exactly one school |
| **Teacher** | Only their own record | Personal login/completion history only |

There is no "sign up" flow — accounts are provisioned by an admin. The only
public page is login.

## 3. Visual style direction

- Clean, professional, data-dense B2B dashboard — not playful or consumer-y.
  Think Linear, Vercel dashboard, or Retool: neutral background, restrained
  color, generous whitespace around dense tables.
- **Status color convention (use consistently everywhere a percentage or
  completion rate is shown):**
  - Green: ≥ 80%
  - Amber: 60–79%
  - Red: < 60%
- Support both light and dark mode if possible; if only one, default to light.
- Fully responsive — admins will check this on tablets and phones between
  meetings, not just desktop.
- Tables are the primary UI element (schools, teachers, lessons) — prioritize
  legible, sortable, scannable table design over decorative charts.
- Accessible: real contrast ratios, focus states, no color-only status
  indicators (pair color with an icon or label too).

## 4. Global UI patterns

- **Top-level nav**: minimal — logo/org name, current user email, sign-out.
  Super Admins additionally get a school switcher/filter; School Admins and
  Teachers don't see one (they're auto-scoped).
- **Loading state**: skeleton rows for tables, not spinners, where practical.
- **Empty state**: "No data available for this account" — plain, not an error.
- **Error state**: a small inline red banner with the message, not a full-page
  crash.
- **Last-updated indicator**: several data sources sync on different cadences
  (some daily/automated, lesson completion is a manual weekly upload) — surface
  a "data as of [date]" note near any section fed by a source that isn't
  real-time.

## 5. Screens to design

### 5.1 Login — `/login` (build now, highest priority)

Simple centered card: email field, password field, submit button, error message
slot. No sign-up link (accounts are provisioned, not self-served). Product name
"Core Group Dashboard" as the header/logo area.

### 5.2 Dashboard — School Report — `/dashboard` (build now, highest priority)

The main and currently only data screen. One row per school the signed-in user
can see (1 row for a School Admin, up to 12 for a Super Admin). Columns, all
from `get_my_school_report()`:

| Field | Meaning |
|---|---|
| `school_name` | School name |
| `drived_users` | Total users (Drived) |
| `drived_invited` | Invited |
| `drived_accepted` | Accepted invite |
| `drived_logged` | Logged in |
| `drived_studied` | Actively studied |
| `drived_latest_snapshot_date` | Date of the Drived numbers above |
| `product_fruits_active_users` | Active users this period |
| `product_fruits_teachers` / `product_fruits_admins` | Breakdown by role |
| `product_fruits_last_activity` | Last login timestamp anywhere in the school |
| `lms_course_rows` | Number of course enrollments tracked |
| `total_lessons_completed` / `total_lessons_assigned` | Lesson completion counts |
| `lms_avg_completion_pct` | Avg lesson completion % (apply color threshold) |

This is naturally a wide table — consider a card-based layout for
mobile/tablet and a dense table for desktop, or grouped column headers (Drived /
Product Fruits / LMS) to make the width digestible. A Super Admin
viewing 12 rows should be able to scan and compare schools at a glance —
sortable columns matter here.

### 5.3 School trend detail — `/schools/[id]` (future phase, design if time allows)

Drill-down from a row in 5.2. Time-series view of one school using
`v_school_trend` (same metric families as above, but one row per
`snapshot_date` instead of one row per school) — line/area charts per metric
family (Drived adoption funnel over time, lesson completion over time) rather
than a table.

### 5.4 Teacher report — `/teachers` (future phase, design if time allows)

School Admin only (their own school's teachers). Table from `v_teacher_report`:

| Field | Meaning |
|---|---|
| `teacher_name` | Name |
| `primary_email` | Email |
| `course_rows` | Number of courses tracked for this teacher |
| `total_lessons_completed` / `total_lessons_assigned` | Completion counts |
| `avg_completion_pct` | Avg completion % (color threshold badge) |
| `last_product_fruits_activity` | Last login timestamp |

Sortable, searchable by name. Clicking a row opens the teacher detail view.

### 5.5 Teacher detail — `/teachers/[id]` (future phase)

Two-panel layout:
- **Left**: login/activity timeline (from `fact.product_fruits_activity`,
  reverse chronological)
- **Right**: lesson grid — every course/lesson this teacher is tracked against
  (`fact.lms_completions`: `course_title`, `lessons_completed`/`lessons_total`,
  `completion_pct`), shown as status cards or a progress-bar list.

### 5.6 Admin — sync/data-freshness status — `/admin` (future phase, Super Admin only)

Not a data-entry screen — a status page. Shows, per source (Drived,
Product Fruits, LMS manual upload): last successful update timestamp, and a
warning state if a source hasn't updated recently. Simple status-card row.

## 6. Component inventory (name these consistently if Stitch lets you label components)

- **KPI stat card** — single metric, big number, label, optional color-coded
  delta/badge
- **Data table** — sortable headers, row hover, pagination, empty/loading
  states, optional grouped column headers
- **Completion badge** — colored pill (green/amber/red) showing a percentage,
  used everywhere a completion or watch-% rate appears
- **Trend line/area chart** — single metric over time, one school
- **Timeline list** — reverse-chronological event list (logins)
- **Two-panel detail layout** — used on teacher/lesson drill-downs
- **Status banner** — inline success/warning/error banner for data-freshness or
  form errors
- **Auth form** — email + password, submit, inline error text

## 7. Technical constraints for the handoff

- Built in **Next.js (App Router) + Tailwind CSS v4**. Exported markup using
  Tailwind utility classes (or plain semantic HTML/CSS we can convert) is far
  easier to integrate than a heavy component library or inline styles.
- Keep components as plain HTML structure where possible — the backend wiring
  (data fetching, auth, routing) already exists; only the visual layer is being
  replaced.
- No dark-mode requirement blocking launch, but nice to have.
