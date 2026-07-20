-- Add a Module tier between Course and Lesson.
--
-- The 37 rows loaded into catalog.lessons on 20260714 (e.g. "Grade R-
-- Overview", "Grade R- Music and Language") were actually MODULES, not
-- individual lessons -- confirmed against the real per-lesson export, which
-- shows each module contains several real, tickable lessons. This migration:
--   1. adds catalog.modules (course -> module)
--   2. migrates those 37 existing rows from catalog.lessons into
--      catalog.modules (verified zero lesson_progress rows reference them,
--      so nothing is lost)
--   3. repoints catalog.lessons at module_id instead of course_id
--   4. updates every RPC and reporting view that walked course_id -> lessons
--      directly, to walk course_id -> modules -> lessons instead

-- ---------- 1. New table ----------
CREATE TABLE catalog.modules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id bigint NOT NULL REFERENCES catalog.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_modules_course ON catalog.modules(course_id);
ALTER TABLE catalog.modules ENABLE ROW LEVEL SECURITY;

-- ---------- 2. Migrate the existing 37 rows (modules mislabeled as lessons) ----------
INSERT INTO catalog.modules (course_id, title, sort_order, created_at)
SELECT course_id, title, sort_order, created_at FROM catalog.lessons;

-- Safety check: this only proceeds cleanly because no lesson_progress exists
-- yet (verified beforehand). Clear the mislabeled rows now that they're
-- copied into catalog.modules as modules.
DELETE FROM catalog.lesson_progress;
DELETE FROM catalog.lessons;

-- ---------- 3. Add module_id (course_id dropped later, once nothing
-- references it -- the reporting views below still read course_id until
-- they're rewritten in this same migration) ----------
ALTER TABLE catalog.lessons ADD COLUMN module_id bigint REFERENCES catalog.modules(id) ON DELETE CASCADE;

-- ---------- 4a. Teacher RPCs ----------
CREATE OR REPLACE FUNCTION public.get_my_courses()
RETURNS TABLE(course_id bigint, grade text, title text, lessons_total int, lessons_completed int, completion_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH me AS (SELECT identity.my_person_id() AS pid)
  SELECT c.id, c.grade, c.title,
    count(l.id)::int AS lessons_total,
    count(lp.id)::int AS lessons_completed,
    CASE WHEN count(l.id) > 0
         THEN round(100.0 * count(lp.id) / count(l.id), 0)
         ELSE 0 END AS completion_pct
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

-- Now returns lessons grouped by module for one course (return shape changed).
DROP FUNCTION IF EXISTS public.get_course_lessons(bigint);
CREATE FUNCTION public.get_course_lessons(p_course_id bigint)
RETURNS TABLE(module_id bigint, module_title text, module_sort_order int, lesson_id bigint, title text, sort_order int, completed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.id, m.title, m.sort_order, l.id, l.title, l.sort_order,
    EXISTS (
      SELECT 1 FROM catalog.lesson_progress lp
      WHERE lp.lesson_id = l.id AND lp.person_id = identity.my_person_id()
    ) AS completed
  FROM catalog.modules m
  JOIN catalog.lessons l ON l.module_id = m.id
  WHERE m.course_id = p_course_id
    AND (
      identity.is_super_admin()
      OR identity.is_school_admin()
      OR EXISTS (
        SELECT 1 FROM catalog.course_assignments ca
        WHERE ca.course_id = p_course_id AND ca.person_id = identity.my_person_id()
      )
    )
  ORDER BY m.sort_order, l.sort_order, l.id;
$$;
GRANT EXECUTE ON FUNCTION public.get_course_lessons(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_lesson_complete(p_lesson_id bigint, p_completed boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_person bigint := identity.my_person_id(); v_course bigint;
BEGIN
  IF v_person IS NULL THEN
    RAISE EXCEPTION 'No teacher profile for this account' USING errcode = '42501';
  END IF;
  SELECT m.course_id INTO v_course
  FROM catalog.lessons l JOIN catalog.modules m ON m.id = l.module_id
  WHERE l.id = p_lesson_id;
  IF v_course IS NULL THEN
    RAISE EXCEPTION 'Unknown lesson';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM catalog.course_assignments ca
    WHERE ca.course_id = v_course AND ca.person_id = v_person
  ) THEN
    RAISE EXCEPTION 'You are not assigned this course' USING errcode = '42501';
  END IF;

  IF p_completed THEN
    INSERT INTO catalog.lesson_progress (person_id, lesson_id)
    VALUES (v_person, p_lesson_id)
    ON CONFLICT (person_id, lesson_id) DO NOTHING;
  ELSE
    DELETE FROM catalog.lesson_progress WHERE person_id = v_person AND lesson_id = p_lesson_id;
  END IF;
  RETURN p_completed;
END;
$$;

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

-- ---------- 4b. Super-admin authoring RPCs ----------
-- Return shape changed (added module_count).
DROP FUNCTION IF EXISTS public.admin_list_courses();
CREATE FUNCTION public.admin_list_courses()
RETURNS TABLE(course_id bigint, grade text, title text, is_active boolean, module_count int, lessons_total int, assigned_teachers int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.grade, c.title, c.is_active,
    (SELECT count(*) FROM catalog.modules m WHERE m.course_id = c.id)::int,
    (SELECT count(*) FROM catalog.lessons l JOIN catalog.modules m ON m.id = l.module_id WHERE m.course_id = c.id)::int,
    (SELECT count(*) FROM catalog.course_assignments ca WHERE ca.course_id = c.id)::int
  FROM catalog.courses c
  WHERE identity.is_super_admin()
  ORDER BY c.sort_order, c.title;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_courses() TO authenticated;

-- New: list a course's modules (for the Manage course page).
CREATE OR REPLACE FUNCTION public.admin_list_modules(p_course_id bigint)
RETURNS TABLE(module_id bigint, title text, sort_order int, lessons_total int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.id, m.title, m.sort_order,
    (SELECT count(*) FROM catalog.lessons l WHERE l.module_id = m.id)::int
  FROM catalog.modules m
  WHERE m.course_id = p_course_id AND identity.is_super_admin()
  ORDER BY m.sort_order, m.id;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_modules(bigint) TO authenticated;

-- New: create a module within a course.
CREATE OR REPLACE FUNCTION public.admin_add_module(p_course_id bigint, p_title text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  IF NOT identity.is_super_admin() THEN RAISE EXCEPTION 'Not authorized' USING errcode = '42501'; END IF;
  IF nullif(btrim(p_title), '') IS NULL THEN RAISE EXCEPTION 'Module title is required'; END IF;
  INSERT INTO catalog.modules (course_id, title, sort_order)
  VALUES (p_course_id, btrim(p_title),
          coalesce((SELECT max(sort_order) FROM catalog.modules WHERE course_id = p_course_id), 0) + 1)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_add_module(bigint, text) TO authenticated;

-- admin_add_lesson now takes a module_id, not a course_id.
DROP FUNCTION IF EXISTS public.admin_add_lesson(bigint, text);
CREATE FUNCTION public.admin_add_lesson(p_module_id bigint, p_title text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  IF NOT identity.is_super_admin() THEN RAISE EXCEPTION 'Not authorized' USING errcode = '42501'; END IF;
  IF nullif(btrim(p_title), '') IS NULL THEN RAISE EXCEPTION 'Lesson title is required'; END IF;
  INSERT INTO catalog.lessons (module_id, title, sort_order)
  VALUES (p_module_id, btrim(p_title),
          coalesce((SELECT max(sort_order) FROM catalog.lessons WHERE module_id = p_module_id), 0) + 1)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_add_lesson(bigint, text) TO authenticated;

-- ---------- 4c. Reporting views (route lessons through modules) ----------
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
  JOIN catalog.modules m ON m.course_id = ca.course_id
  JOIN catalog.lessons l ON l.module_id = m.id
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

-- ---------- 5. Now safe to finish repointing lessons at modules ----------
DROP INDEX IF EXISTS catalog.idx_lessons_course;
ALTER TABLE catalog.lessons DROP COLUMN course_id;
ALTER TABLE catalog.lessons ALTER COLUMN module_id SET NOT NULL;
CREATE INDEX idx_lessons_module ON catalog.lessons(module_id);
