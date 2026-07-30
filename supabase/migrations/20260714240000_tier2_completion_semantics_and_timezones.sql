-- Tier-2 fixes from the full calculations audit: numbers that were
-- technically correct in isolation but visibly contradicted each other
-- across pages.
--
-- 1. Zero-lesson-total (a course/person with assignments but no lessons
--    authored yet) rendered as a literal 0% everywhere -- indistinguishable
--    from genuinely zero progress. Changed every completion calculation to
--    return NULL ("not applicable") instead, via `nullif(denominator, 0)`.
--
-- 2. get_my_courses / get_person_catalog_progress rounded completion to 0
--    decimals, so 249/250 lessons (99.6%) showed as "100% complete" on the
--    teacher's own My Courses page while the School/Teacher reports (1
--    decimal) correctly showed it unfinished. Matched to 1 decimal.
--
-- 3. v_school_report and v_teacher_report walked course_assignments ->
--    modules -> lessons with no catalog.courses.is_active filter, so an
--    archived course's lessons still counted toward totals even though
--    get_my_courses/get_person_catalog_progress (which do filter on
--    is_active) exclude it and it's un-tickable. Added the same filter to
--    both report views and to v_school_trend.
--
-- 4. v_school_report's catalog_progress aggregated over every person with a
--    school_id, with no role filter, while v_teacher_report filters to
--    role = 'teacher'. That let the School Report's totals for a school
--    disagree with the sum of that school's own rows on the Teachers page.
--    Aligned both (and v_school_trend) to the same teacher-role filter.
--
-- 5. v_school_trend's "total lessons assigned" was a same-day subquery with
--    no date filter, so it always reflected *today's* assignment count
--    applied to every historical point -- assigning a school 5 new courses
--    today silently redraws its entire past trend line. Time-scoped it by
--    course_assignments.created_at, matching the numerator's existing
--    per-date filtering.
--
-- 6. completed_at::date (in v_school_trend) and the Product Fruits date
--    parser both truncated/interpreted in the database session's timezone
--    (UTC), while the schools are all SAST (UTC+2) -- a late-evening
--    completion could land on the wrong trend date. Both now convert
--    through Africa/Johannesburg explicitly.

-- ---------- School Report: is_active + teacher-role filter, NULL-safe completion ----------
CREATE OR REPLACE VIEW reporting.v_school_report AS
WITH drived_latest AS (
  SELECT DISTINCT ON (school_usage_daily.school_id) school_usage_daily.school_id,
    school_usage_daily.snapshot_date, school_usage_daily.users, school_usage_daily.invited,
    school_usage_daily.accepted, school_usage_daily.logged, school_usage_daily.studied
  FROM fact.school_usage_daily
  WHERE school_usage_daily.school_id IS NOT NULL
  ORDER BY school_usage_daily.school_id, school_usage_daily.snapshot_date DESC
), product_fruits_agg AS (
  SELECT pfa.school_id,
    count(DISTINCT pfa.person_id) AS active_user_count,
    count(DISTINCT pfa.person_id) FILTER (WHERE lower(pfa.user_role) = 'teacher'::text) AS teacher_count,
    count(DISTINCT pfa.person_id) FILTER (WHERE lower(pfa.user_role) = 'school administrator'::text) AS admin_count,
    max(pfa.event_datetime) AS last_activity_at
  FROM fact.product_fruits_activity pfa
  JOIN (
    SELECT DISTINCT ON (school_id) school_id, snapshot_date
    FROM fact.product_fruits_activity
    WHERE school_id IS NOT NULL
    ORDER BY school_id, snapshot_date DESC NULLS LAST
  ) pl ON pl.school_id = pfa.school_id AND pfa.snapshot_date IS NOT DISTINCT FROM pl.snapshot_date
  WHERE pfa.school_id IS NOT NULL
  GROUP BY pfa.school_id
), catalog_progress AS (
  SELECT ca.person_id, ca.course_id, p.school_id,
    count(l.id) AS lessons_total,
    count(lp.id) AS lessons_completed
  FROM catalog.course_assignments ca
  JOIN identity.people p ON p.id = ca.person_id
  JOIN catalog.courses c ON c.id = ca.course_id AND c.is_active
  LEFT JOIN catalog.modules m ON m.course_id = ca.course_id
  LEFT JOIN catalog.lessons l ON l.module_id = m.id
  LEFT JOIN catalog.lesson_progress lp ON lp.lesson_id = l.id AND lp.person_id = ca.person_id
  WHERE p.school_id IS NOT NULL AND lower(p.role) = 'teacher'
  GROUP BY ca.person_id, ca.course_id, p.school_id
), catalog_agg AS (
  SELECT school_id,
    count(*)::bigint AS course_rows,
    sum(lessons_completed)::bigint AS total_lessons_completed,
    sum(lessons_total)::bigint AS total_lessons_assigned,
    round(100.0 * sum(lessons_completed) / nullif(sum(lessons_total), 0), 1) AS avg_completion_pct
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

-- ---------- Teacher Report: is_active filter, NULL-safe completion ----------
CREATE OR REPLACE VIEW reporting.v_teacher_report AS
WITH per_course AS (
  SELECT ca.person_id, ca.course_id,
    count(l.id) AS lessons_total,
    count(lp.id) AS lessons_completed
  FROM catalog.course_assignments ca
  JOIN catalog.courses c ON c.id = ca.course_id AND c.is_active
  LEFT JOIN catalog.modules m ON m.course_id = ca.course_id
  LEFT JOIN catalog.lessons l ON l.module_id = m.id
  LEFT JOIN catalog.lesson_progress lp ON lp.lesson_id = l.id AND lp.person_id = ca.person_id
  GROUP BY ca.person_id, ca.course_id
), catalog_progress AS (
  SELECT person_id,
    count(*)::bigint AS course_rows,
    sum(lessons_completed)::bigint AS total_lessons_completed,
    sum(lessons_total)::bigint AS total_lessons_assigned,
    round(100.0 * sum(lessons_completed) / nullif(sum(lessons_total), 0), 1) AS avg_completion_pct
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

-- ---------- School Trend: is_active + teacher-role filter, time-scoped denominator, SAST dates ----------
CREATE OR REPLACE VIEW reporting.v_school_trend AS
WITH drived_series AS (
  SELECT school_usage_daily.school_id, school_usage_daily.snapshot_date,
    school_usage_daily.users, school_usage_daily.invited, school_usage_daily.accepted,
    school_usage_daily.logged, school_usage_daily.studied
  FROM fact.school_usage_daily
  WHERE school_usage_daily.school_id IS NOT NULL
), catalog_assign AS (
  SELECT ca.person_id, ca.course_id, ca.created_at, p.school_id, l.id AS lesson_id
  FROM catalog.course_assignments ca
  JOIN identity.people p ON p.id = ca.person_id
  JOIN catalog.courses c ON c.id = ca.course_id AND c.is_active
  JOIN catalog.modules m ON m.course_id = ca.course_id
  JOIN catalog.lessons l ON l.module_id = m.id
  WHERE p.school_id IS NOT NULL AND lower(p.role) = 'teacher'
), catalog_dates AS (
  SELECT DISTINCT ca.school_id, (lp.completed_at AT TIME ZONE 'Africa/Johannesburg')::date AS snapshot_date
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
    (SELECT count(*) FROM catalog_assign ca
     WHERE ca.school_id = d.school_id
       AND (ca.created_at AT TIME ZONE 'Africa/Johannesburg')::date <= d.snapshot_date)::bigint AS total_lessons_assigned,
    (SELECT count(*) FROM catalog_assign ca
       JOIN catalog.lesson_progress lp ON lp.lesson_id = ca.lesson_id AND lp.person_id = ca.person_id
     WHERE ca.school_id = d.school_id
       AND (lp.completed_at AT TIME ZONE 'Africa/Johannesburg')::date <= d.snapshot_date)::bigint AS total_lessons_completed
  FROM distinct_school_dates d
)
SELECT s.id AS school_id, s.school_name, d.snapshot_date,
  dr.users AS drived_users, dr.invited AS drived_invited, dr.accepted AS drived_accepted,
  dr.logged AS drived_logged, dr.studied AS drived_studied,
  cs.total_lessons_completed, cs.total_lessons_assigned,
  round(100.0 * cs.total_lessons_completed / nullif(cs.total_lessons_assigned, 0), 1) AS lms_avg_completion_pct
FROM all_dates d
  JOIN identity.schools s ON s.id = d.school_id
  LEFT JOIN drived_series dr ON dr.school_id = d.school_id AND dr.snapshot_date = d.snapshot_date
  LEFT JOIN catalog_series cs ON cs.school_id = d.school_id AND cs.snapshot_date = d.snapshot_date
ORDER BY s.school_name, d.snapshot_date;

-- ---------- get_my_courses / get_person_catalog_progress: 1-decimal, NULL-safe completion ----------
CREATE OR REPLACE FUNCTION public.get_my_courses()
RETURNS TABLE(course_id bigint, grade text, title text, lessons_total int, lessons_completed int, completion_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH me AS (SELECT identity.my_person_id() AS pid)
  SELECT c.id, c.grade, c.title,
    count(l.id)::int AS lessons_total,
    count(lp.id)::int AS lessons_completed,
    round(100.0 * count(lp.id) / nullif(count(l.id), 0), 1) AS completion_pct
  FROM me
  JOIN catalog.course_assignments ca ON ca.person_id = me.pid
  JOIN catalog.courses c ON c.id = ca.course_id AND c.is_active
  LEFT JOIN catalog.modules m ON m.course_id = c.id
  LEFT JOIN catalog.lessons l ON l.module_id = m.id
  LEFT JOIN catalog.lesson_progress lp ON lp.lesson_id = l.id AND lp.person_id = me.pid
  WHERE me.pid IS NOT NULL
  GROUP BY c.id, c.grade, c.title, c.sort_order
  ORDER BY c.sort_order, c.title;
$$;

CREATE OR REPLACE FUNCTION public.get_person_catalog_progress(target_person_id bigint)
RETURNS TABLE(course_id bigint, grade text, title text, lessons_total int, lessons_completed int, completion_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.grade, c.title,
    count(l.id)::int AS lessons_total,
    count(lp.id)::int AS lessons_completed,
    round(100.0 * count(lp.id) / nullif(count(l.id), 0), 1) AS completion_pct
  FROM catalog.course_assignments ca
  JOIN catalog.courses c ON c.id = ca.course_id AND c.is_active
  LEFT JOIN catalog.modules m ON m.course_id = c.id
  LEFT JOIN catalog.lessons l ON l.module_id = m.id
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

-- ---------- Product Fruits date parser: interpret the human PF timestamp as SAST, not session TZ ----------
CREATE OR REPLACE FUNCTION identity.parse_pf_datetime(p_raw text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  s text := btrim(coalesce(p_raw, ''));
  cleaned text;
BEGIN
  IF s = '' THEN
    RETURN NULL;
  END IF;

  -- Leading weekday name + comma => the PF human format, always local (SAST).
  IF s ~ '^[A-Za-z]+,' THEN
    cleaned := regexp_replace(s, '^[A-Za-z]+,\s*', '');          -- drop "Tuesday, "
    cleaned := regexp_replace(cleaned, '\s+[Aa][Tt]\s+', ' ');   -- " at " -> " "
    BEGIN
      RETURN (to_timestamp(cleaned, 'DD Month YYYY HH24:MI')::timestamp) AT TIME ZONE 'Africa/Johannesburg';
    EXCEPTION WHEN OTHERS THEN
      -- fall through to a generic cast
    END;
  END IF;

  BEGIN
    RETURN s::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;
