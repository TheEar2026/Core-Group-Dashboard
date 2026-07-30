-- Fix "Completion %" on the School Report and Teachers pages.
--
-- avg_completion_pct was computed as an unweighted average of each
-- (person, course) row's own percentage, with courses that have zero
-- lessons folded in as a literal 0%. A school/teacher with real progress
-- (e.g. 7 of 2,212 lessons done) could still show "0%" once enough
-- zero-lesson course assignments dragged the average down.
--
-- Switch to sum(completed) / sum(assigned), matching how v_school_trend
-- and the client-side KPI tiles already compute completion, and matching
-- what the adjacent "Lessons" column (done / assigned) actually shows.

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
  SELECT ca.person_id, ca.course_id, p.school_id,
    count(l.id) AS lessons_total,
    count(lp.id) AS lessons_completed
  FROM catalog.course_assignments ca
  JOIN identity.people p ON p.id = ca.person_id
  LEFT JOIN catalog.modules m ON m.course_id = ca.course_id
  LEFT JOIN catalog.lessons l ON l.module_id = m.id
  LEFT JOIN catalog.lesson_progress lp ON lp.lesson_id = l.id AND lp.person_id = ca.person_id
  WHERE p.school_id IS NOT NULL
  GROUP BY ca.person_id, ca.course_id, p.school_id
), catalog_agg AS (
  SELECT school_id,
    count(*)::bigint AS course_rows,
    sum(lessons_completed)::bigint AS total_lessons_completed,
    sum(lessons_total)::bigint AS total_lessons_assigned,
    round(CASE WHEN sum(lessons_total) > 0
               THEN 100.0 * sum(lessons_completed) / sum(lessons_total)
               ELSE 0 END, 1) AS avg_completion_pct
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

CREATE OR REPLACE VIEW reporting.v_teacher_report AS
WITH per_course AS (
  SELECT ca.person_id, ca.course_id,
    count(l.id) AS lessons_total,
    count(lp.id) AS lessons_completed
  FROM catalog.course_assignments ca
  LEFT JOIN catalog.modules m ON m.course_id = ca.course_id
  LEFT JOIN catalog.lessons l ON l.module_id = m.id
  LEFT JOIN catalog.lesson_progress lp ON lp.lesson_id = l.id AND lp.person_id = ca.person_id
  GROUP BY ca.person_id, ca.course_id
), catalog_progress AS (
  SELECT person_id,
    count(*)::bigint AS course_rows,
    sum(lessons_completed)::bigint AS total_lessons_completed,
    sum(lessons_total)::bigint AS total_lessons_assigned,
    round(CASE WHEN sum(lessons_total) > 0
               THEN 100.0 * sum(lessons_completed) / sum(lessons_total)
               ELSE 0 END, 1) AS avg_completion_pct
  FROM per_course
  GROUP BY person_id
), login_agg AS (
  SELECT tu.person_id,
    count(le.id) AS login_count,
    max(le.created_at) AS last_login_at
  FROM identity.teacher_users tu
  LEFT JOIN identity.login_events le ON le.auth_user_id = tu.auth_user_id
  GROUP BY tu.person_id
), grade_agg AS (
  SELECT person_id, string_agg(grade, ', ' ORDER BY sort_rank) AS grades
  FROM (
    SELECT DISTINCT ca.person_id, c.grade,
      CASE
        WHEN upper(btrim(c.grade)) IN ('GRADE R', 'R') THEN 0
        WHEN substring(c.grade FROM '(\d+)') ~ '^\d+$' THEN substring(c.grade FROM '(\d+)')::int
        ELSE 99
      END AS sort_rank
    FROM catalog.course_assignments ca
    JOIN catalog.courses c ON c.id = ca.course_id
    WHERE c.grade IS NOT NULL
  ) x
  GROUP BY person_id
)
SELECT p.id AS person_id, p.canonical_full_name AS teacher_name, p.primary_email, p.school_id, s.school_name,
  ga.grades,
  coalesce(cp.course_rows, 0) AS course_rows,
  coalesce(cp.total_lessons_completed, 0) AS total_lessons_completed,
  coalesce(cp.total_lessons_assigned, 0) AS total_lessons_assigned,
  cp.avg_completion_pct,
  coalesce(la.login_count, 0) AS login_count,
  la.last_login_at,
  max(pfa.event_datetime) AS last_product_fruits_activity
FROM identity.people p
  LEFT JOIN identity.schools s ON s.id = p.school_id
  LEFT JOIN catalog_progress cp ON cp.person_id = p.id
  LEFT JOIN login_agg la ON la.person_id = p.id
  LEFT JOIN grade_agg ga ON ga.person_id = p.id
  LEFT JOIN fact.product_fruits_activity pfa ON pfa.person_id = p.id
WHERE lower(p.role) = 'teacher'::text
GROUP BY p.id, p.canonical_full_name, p.primary_email, p.school_id, s.school_name,
  ga.grades, cp.course_rows, cp.total_lessons_completed, cp.total_lessons_assigned, cp.avg_completion_pct,
  la.login_count, la.last_login_at
ORDER BY s.school_name, p.canonical_full_name;
