-- Replace LMS-scraped lesson data with teacher self-marked progress everywhere.
--
-- Teachers now tick their own lessons off (catalog.lesson_progress, added in
-- 20260714150000). This migration makes that the source of truth for lesson
-- completion across the reporting layer, so a school admin actually sees a
-- teacher's ticks reflected — today they see nothing, because the reports
-- still read the old fact.lms_completions (from the LMS scrape) which the
-- teacher's ticks never touch.
--
-- Column names are kept identical (including the historical "lms_" prefix on
-- a couple of them) so no other RPC or frontend type needs to change — only
-- the underlying query source moves from fact.lms_completions to catalog.*.
-- All three views keep the exact same column list/types, so CREATE OR REPLACE
-- VIEW is safe here (no need to drop the SETOF-typed wrapper functions).
--
-- fact.lms_completions / staging.stg_lms are left in place (historical data,
-- now unused) rather than dropped, in case they're wanted for reference later.

-- ---------- v_school_report ----------
CREATE OR REPLACE VIEW reporting.v_school_report AS
WITH drived_latest AS (
  SELECT DISTINCT ON (school_usage_daily.school_id) school_usage_daily.school_id,
    school_usage_daily.snapshot_date, school_usage_daily.users, school_usage_daily.invited,
    school_usage_daily.accepted, school_usage_daily.logged, school_usage_daily.studied
  FROM fact.school_usage_daily
  WHERE school_usage_daily.school_id IS NOT NULL
  ORDER BY school_usage_daily.school_id, school_usage_daily.snapshot_date DESC
), product_fruits_agg AS (
  SELECT product_fruits_activity.school_id,
    count(DISTINCT product_fruits_activity.person_id) AS active_user_count,
    count(DISTINCT product_fruits_activity.person_id) FILTER (WHERE lower(product_fruits_activity.user_role) = 'teacher'::text) AS teacher_count,
    count(DISTINCT product_fruits_activity.person_id) FILTER (WHERE lower(product_fruits_activity.user_role) = 'school administrator'::text) AS admin_count,
    max(product_fruits_activity.event_datetime) AS last_activity_at
  FROM fact.product_fruits_activity
  WHERE product_fruits_activity.school_id IS NOT NULL
  GROUP BY product_fruits_activity.school_id
), catalog_progress AS (
  -- One row per (teacher, assigned course): lessons in that course vs. that teacher's ticks.
  SELECT ca.person_id, ca.course_id, p.school_id,
    count(l.id) AS lessons_total,
    count(lp.id) AS lessons_completed
  FROM catalog.course_assignments ca
  JOIN identity.people p ON p.id = ca.person_id
  LEFT JOIN catalog.lessons l ON l.course_id = ca.course_id
  LEFT JOIN catalog.lesson_progress lp ON lp.lesson_id = l.id AND lp.person_id = ca.person_id
  WHERE p.school_id IS NOT NULL
  GROUP BY ca.person_id, ca.course_id, p.school_id
), catalog_agg AS (
  SELECT school_id,
    count(*)::bigint AS course_rows,
    sum(lessons_completed)::bigint AS total_lessons_completed,
    sum(lessons_total)::bigint AS total_lessons_assigned,
    round(avg(CASE WHEN lessons_total > 0 THEN 100.0 * lessons_completed / lessons_total ELSE 0 END), 1) AS avg_completion_pct
  FROM catalog_progress
  GROUP BY school_id
)
SELECT s.id AS school_id, s.school_name, s.drived_core_id,
  dl.snapshot_date AS drived_latest_snapshot_date,
  dl.users AS drived_users, dl.invited AS drived_invited, dl.accepted AS drived_accepted,
  dl.logged AS drived_logged, dl.studied AS drived_studied,
  pfa.active_user_count AS product_fruits_active_users,
  pfa.teacher_count AS product_fruits_teachers,
  pfa.admin_count AS product_fruits_admins,
  pfa.last_activity_at AS product_fruits_last_activity,
  ca.course_rows AS lms_course_rows,
  ca.total_lessons_completed, ca.total_lessons_assigned,
  ca.avg_completion_pct AS lms_avg_completion_pct
FROM identity.schools s
  LEFT JOIN drived_latest dl ON dl.school_id = s.id
  LEFT JOIN product_fruits_agg pfa ON pfa.school_id = s.id
  LEFT JOIN catalog_agg ca ON ca.school_id = s.id
ORDER BY s.school_name;

-- ---------- v_school_trend ----------
-- Lesson progress has no daily snapshot (teachers tick in real time), so this
-- reconstructs a trend by counting, as of each date already in the series,
-- how many of the school's currently-assigned lessons were ticked by then
-- (lesson_progress.completed_at::date <= that date). Assignment membership
-- itself isn't tracked historically, so "assigned" uses today's assignments
-- for every date -- an approximation, but the completed/ticked count is exact.
CREATE OR REPLACE VIEW reporting.v_school_trend AS
WITH drived_series AS (
  SELECT school_usage_daily.school_id, school_usage_daily.snapshot_date,
    school_usage_daily.users, school_usage_daily.invited, school_usage_daily.accepted,
    school_usage_daily.logged, school_usage_daily.studied
  FROM fact.school_usage_daily
  WHERE school_usage_daily.school_id IS NOT NULL
), catalog_assign AS (
  SELECT ca.person_id, ca.course_id, p.school_id, l.id AS lesson_id
  FROM catalog.course_assignments ca
  JOIN identity.people p ON p.id = ca.person_id
  JOIN catalog.lessons l ON l.course_id = ca.course_id
  WHERE p.school_id IS NOT NULL
), catalog_dates AS (
  SELECT DISTINCT ca.school_id, (lp.completed_at)::date AS snapshot_date
  FROM catalog_assign ca
  JOIN catalog.lesson_progress lp ON lp.lesson_id = ca.lesson_id AND lp.person_id = ca.person_id
), all_dates AS (
  SELECT school_id, snapshot_date FROM drived_series
  UNION
  SELECT school_id, snapshot_date FROM catalog_dates
), distinct_school_dates AS (
  SELECT DISTINCT school_id, snapshot_date FROM all_dates
), catalog_series AS (
  SELECT d.school_id, d.snapshot_date,
    (SELECT count(*) FROM catalog_assign ca WHERE ca.school_id = d.school_id)::bigint AS total_lessons_assigned,
    (SELECT count(*) FROM catalog_assign ca
       JOIN catalog.lesson_progress lp ON lp.lesson_id = ca.lesson_id AND lp.person_id = ca.person_id
     WHERE ca.school_id = d.school_id AND lp.completed_at::date <= d.snapshot_date)::bigint AS total_lessons_completed
  FROM distinct_school_dates d
)
SELECT s.id AS school_id, s.school_name, d.snapshot_date,
  dr.users AS drived_users, dr.invited AS drived_invited, dr.accepted AS drived_accepted,
  dr.logged AS drived_logged, dr.studied AS drived_studied,
  cs.total_lessons_completed, cs.total_lessons_assigned,
  round(CASE WHEN cs.total_lessons_assigned > 0
             THEN 100.0 * cs.total_lessons_completed / cs.total_lessons_assigned
             ELSE 0 END, 1) AS lms_avg_completion_pct
FROM all_dates d
  JOIN identity.schools s ON s.id = d.school_id
  LEFT JOIN drived_series dr ON dr.school_id = d.school_id AND dr.snapshot_date = d.snapshot_date
  LEFT JOIN catalog_series cs ON cs.school_id = d.school_id AND cs.snapshot_date = d.snapshot_date
ORDER BY s.school_name, d.snapshot_date;

-- ---------- v_teacher_report ----------
CREATE OR REPLACE VIEW reporting.v_teacher_report AS
WITH per_course AS (
  SELECT ca.person_id, ca.course_id,
    count(l.id) AS lessons_total,
    count(lp.id) AS lessons_completed
  FROM catalog.course_assignments ca
  LEFT JOIN catalog.lessons l ON l.course_id = ca.course_id
  LEFT JOIN catalog.lesson_progress lp ON lp.lesson_id = l.id AND lp.person_id = ca.person_id
  GROUP BY ca.person_id, ca.course_id
), catalog_progress AS (
  SELECT person_id,
    count(*)::bigint AS course_rows,
    sum(lessons_completed)::bigint AS total_lessons_completed,
    sum(lessons_total)::bigint AS total_lessons_assigned,
    round(avg(CASE WHEN lessons_total > 0 THEN 100.0 * lessons_completed / lessons_total ELSE 0 END), 1) AS avg_completion_pct
  FROM per_course
  GROUP BY person_id
)
SELECT p.id AS person_id, p.canonical_full_name AS teacher_name, p.primary_email, p.school_id, s.school_name,
  coalesce(cp.course_rows, 0) AS course_rows,
  coalesce(cp.total_lessons_completed, 0) AS total_lessons_completed,
  coalesce(cp.total_lessons_assigned, 0) AS total_lessons_assigned,
  cp.avg_completion_pct,
  max(pfa.event_datetime) AS last_product_fruits_activity
FROM identity.people p
  LEFT JOIN identity.schools s ON s.id = p.school_id
  LEFT JOIN catalog_progress cp ON cp.person_id = p.id
  LEFT JOIN fact.product_fruits_activity pfa ON pfa.person_id = p.id
WHERE lower(p.role) = 'teacher'::text
GROUP BY p.id, p.canonical_full_name, p.primary_email, p.school_id, s.school_name,
  cp.course_rows, cp.total_lessons_completed, cp.total_lessons_assigned, cp.avg_completion_pct
ORDER BY s.school_name, p.canonical_full_name;

-- ---------- Staff view of one teacher's catalog progress ----------
-- Replaces get_teacher_lesson_progress (which read fact.lms_completions) for
-- the teacher detail page's "Lesson progress" panel. Same access rule as the
-- rest of the teacher RPCs.
CREATE OR REPLACE FUNCTION public.get_person_catalog_progress(target_person_id bigint)
RETURNS TABLE(course_id bigint, grade text, title text, lessons_total int, lessons_completed int, completion_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.grade, c.title,
    count(l.id)::int AS lessons_total,
    count(lp.id)::int AS lessons_completed,
    CASE WHEN count(l.id) > 0
         THEN round(100.0 * count(lp.id) / count(l.id), 0)
         ELSE 0 END AS completion_pct
  FROM catalog.course_assignments ca
  JOIN catalog.courses c ON c.id = ca.course_id AND c.is_active
  LEFT JOIN catalog.lessons l ON l.course_id = c.id
  LEFT JOIN catalog.lesson_progress lp ON lp.lesson_id = l.id AND lp.person_id = target_person_id
  WHERE ca.person_id = target_person_id
    AND (
      identity.is_super_admin()
      OR identity.is_school_admin()
      OR EXISTS (
        SELECT 1 FROM identity.people p
        WHERE p.id = target_person_id AND p.school_id IN (SELECT identity.my_school_ids())
      )
      OR target_person_id = identity.my_person_id()
    )
  GROUP BY c.id, c.grade, c.title, c.sort_order
  ORDER BY c.sort_order, c.title;
$$;
GRANT EXECUTE ON FUNCTION public.get_person_catalog_progress(bigint) TO authenticated;

-- ---------- Retire the LMS scrape/ingest path ----------
DROP FUNCTION IF EXISTS public.admin_ingest_lms(jsonb, date);
DROP FUNCTION IF EXISTS public.get_teacher_lesson_progress(bigint);
DROP FUNCTION IF EXISTS public.get_course_completion(text);
