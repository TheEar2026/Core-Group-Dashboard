-- Remove Vimeo video-engagement from the product entirely.
--
-- Drops the Vimeo ingest RPC, the video-engagement fact + staging tables, and
-- strips the vimeo_* columns from the reporting views (and the two RPCs whose
-- return type is coupled to those views).
--
-- NOTE: identity.schools.vimeo_source_url is intentionally KEPT. Despite the
-- name it is the LMS <-> school join key (a school's course subdomain, matched
-- against lms_completions.course_url), used by the identity-matching RPCs. It is
-- an internal field, never shown in the UI.

-- 1. Drop dependents first (functions are typed on the view; views read the table).
DROP FUNCTION IF EXISTS public.admin_ingest_vimeo(jsonb, date);
DROP FUNCTION IF EXISTS public.get_my_school_report();
DROP FUNCTION IF EXISTS public.get_my_school_trend(bigint);
DROP VIEW IF EXISTS reporting.v_school_report;
DROP VIEW IF EXISTS reporting.v_school_trend;
DROP TABLE IF EXISTS fact.school_video_engagement;
DROP TABLE IF EXISTS staging.stg_vimeo;

-- 2. Recreate the school report view without Vimeo.
CREATE VIEW reporting.v_school_report AS
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
), lms_latest AS (
  SELECT DISTINCT ON (lms_completions.person_id, lms_completions.course_url) lms_completions.person_id,
    lms_completions.course_url, lms_completions.snapshot_date, lms_completions.lessons_completed,
    lms_completions.lessons_total, lms_completions.completion_pct
  FROM fact.lms_completions
  WHERE lms_completions.person_id IS NOT NULL
  ORDER BY lms_completions.person_id, lms_completions.course_url, lms_completions.snapshot_date DESC
), lms_agg AS (
  SELECT p.school_id, count(*) AS course_rows,
    sum(ll.lessons_completed) AS total_lessons_completed,
    sum(ll.lessons_total) AS total_lessons_assigned,
    round(avg(ll.completion_pct), 1) AS avg_completion_pct
  FROM lms_latest ll
    JOIN identity.people p ON p.id = ll.person_id
  WHERE p.school_id IS NOT NULL
  GROUP BY p.school_id
)
SELECT s.id AS school_id, s.school_name, s.drived_core_id,
  dl.snapshot_date AS drived_latest_snapshot_date,
  dl.users AS drived_users, dl.invited AS drived_invited, dl.accepted AS drived_accepted,
  dl.logged AS drived_logged, dl.studied AS drived_studied,
  pfa.active_user_count AS product_fruits_active_users,
  pfa.teacher_count AS product_fruits_teachers,
  pfa.admin_count AS product_fruits_admins,
  pfa.last_activity_at AS product_fruits_last_activity,
  la.course_rows AS lms_course_rows,
  la.total_lessons_completed, la.total_lessons_assigned,
  la.avg_completion_pct AS lms_avg_completion_pct
FROM identity.schools s
  LEFT JOIN drived_latest dl ON dl.school_id = s.id
  LEFT JOIN product_fruits_agg pfa ON pfa.school_id = s.id
  LEFT JOIN lms_agg la ON la.school_id = s.id
ORDER BY s.school_name;

-- 3. Recreate the school trend view without Vimeo.
CREATE VIEW reporting.v_school_trend AS
WITH drived_series AS (
  SELECT school_usage_daily.school_id, school_usage_daily.snapshot_date,
    school_usage_daily.users, school_usage_daily.invited, school_usage_daily.accepted,
    school_usage_daily.logged, school_usage_daily.studied
  FROM fact.school_usage_daily
  WHERE school_usage_daily.school_id IS NOT NULL
), lms_series AS (
  SELECT p.school_id, lc.snapshot_date,
    sum(lc.lessons_completed) AS total_lessons_completed,
    sum(lc.lessons_total) AS total_lessons_assigned,
    round(avg(lc.completion_pct), 1) AS avg_completion_pct
  FROM fact.lms_completions lc
    JOIN identity.people p ON p.id = lc.person_id
  WHERE p.school_id IS NOT NULL
  GROUP BY p.school_id, lc.snapshot_date
), all_dates AS (
  SELECT drived_series.school_id, drived_series.snapshot_date FROM drived_series
  UNION
  SELECT lms_series.school_id, lms_series.snapshot_date FROM lms_series
)
SELECT s.id AS school_id, s.school_name, d.snapshot_date,
  dr.users AS drived_users, dr.invited AS drived_invited, dr.accepted AS drived_accepted,
  dr.logged AS drived_logged, dr.studied AS drived_studied,
  lm.total_lessons_completed, lm.total_lessons_assigned,
  lm.avg_completion_pct AS lms_avg_completion_pct
FROM all_dates d
  JOIN identity.schools s ON s.id = d.school_id
  LEFT JOIN drived_series dr ON dr.school_id = d.school_id AND dr.snapshot_date = d.snapshot_date
  LEFT JOIN lms_series lm ON lm.school_id = d.school_id AND lm.snapshot_date = d.snapshot_date
ORDER BY s.school_name, d.snapshot_date;

-- 4. Recreate the access-scoped RPCs over the new views.
CREATE OR REPLACE FUNCTION public.get_my_school_report()
RETURNS SETOF reporting.v_school_report
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT *
  FROM reporting.v_school_report
  WHERE identity.is_super_admin()
     OR identity.is_school_admin()
     OR school_id IN (SELECT identity.my_school_ids());
$function$;
GRANT EXECUTE ON FUNCTION public.get_my_school_report() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_school_trend(target_school_id bigint)
RETURNS SETOF reporting.v_school_trend
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT *
  FROM reporting.v_school_trend
  WHERE school_id = target_school_id
    AND (
      identity.is_super_admin()
      OR identity.is_school_admin()
      OR school_id IN (SELECT identity.my_school_ids())
    )
  ORDER BY snapshot_date;
$function$;
GRANT EXECUTE ON FUNCTION public.get_my_school_trend(bigint) TO authenticated;
