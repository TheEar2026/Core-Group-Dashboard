-- Add a "grades" column to the Teacher Report (the grade(s) a teacher's
-- assigned catalog courses belong to, e.g. "Grade R"), so the Teachers page
-- can show Grade alongside Courses/Lessons/Completion. Column list changes,
-- so drop+recreate the view and its wrapper function as before.

DROP FUNCTION IF EXISTS public.get_my_teacher_report();
DROP VIEW IF EXISTS reporting.v_teacher_report;

CREATE VIEW reporting.v_teacher_report AS
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
    round(avg(CASE WHEN lessons_total > 0 THEN 100.0 * lessons_completed / lessons_total ELSE 0 END), 1) AS avg_completion_pct
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

CREATE FUNCTION public.get_my_teacher_report()
RETURNS SETOF reporting.v_teacher_report
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT *
  FROM reporting.v_teacher_report
  WHERE identity.is_super_admin()
     OR identity.is_school_admin()
     OR school_id IN (SELECT identity.my_school_ids());
$$;
GRANT EXECUTE ON FUNCTION public.get_my_teacher_report() TO authenticated;
