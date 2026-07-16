-- School admins get read-only oversight of ALL schools (not just their own).
--
-- Previously a school_admin was scoped to identity.my_school_ids() — the
-- specific schools listed for them in identity.school_admin_users. The Core
-- Group model instead wants every school admin to see analytics across all
-- partner schools, while staying strictly read-only.
--
-- Reads: this migration adds identity.is_school_admin() and widens the read
-- gate of every analytics RPC so any school_admin (regardless of which
-- school rows they have) sees all schools/teachers.
--
-- Writes: unchanged. Every management/ingest RPC and every table RLS
-- WITH CHECK still hard-gates on identity.is_super_admin(), so school admins
-- cannot create or modify anything. Analytics tables live outside the
-- API-exposed `public` schema and are only reachable through these
-- SECURITY DEFINER functions, so this is the single choke point for reads.

-- Any authenticated user who has at least one school_admin row. We no longer
-- care WHICH schools — the presence of a row grants all-school read access.
CREATE OR REPLACE FUNCTION identity.is_school_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM identity.school_admin_users WHERE auth_user_id = auth.uid()
  );
$$;

-- ---- Analytics RPCs: super admin OR any school admin sees everything ----

CREATE OR REPLACE FUNCTION public.get_my_school_report()
RETURNS SETOF reporting.v_school_report
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM reporting.v_school_report
  WHERE identity.is_super_admin()
     OR identity.is_school_admin()
     OR school_id IN (SELECT identity.my_school_ids());
$$;

CREATE OR REPLACE FUNCTION public.get_my_teacher_report()
RETURNS SETOF reporting.v_teacher_report
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM reporting.v_teacher_report
  WHERE identity.is_super_admin()
     OR identity.is_school_admin()
     OR school_id IN (SELECT identity.my_school_ids());
$$;

CREATE OR REPLACE FUNCTION public.get_my_school_trend(target_school_id bigint)
RETURNS SETOF reporting.v_school_trend
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM reporting.v_school_trend
  WHERE school_id = target_school_id
    AND (
      identity.is_super_admin()
      OR identity.is_school_admin()
      OR school_id IN (SELECT identity.my_school_ids())
    )
  ORDER BY snapshot_date;
$$;

CREATE OR REPLACE FUNCTION public.get_teacher_login_activity(target_person_id bigint)
RETURNS TABLE (
  event_datetime timestamptz,
  user_role text,
  product_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.event_datetime, a.user_role, a.product_type
  FROM fact.product_fruits_activity a
  WHERE a.person_id = target_person_id
    AND (
      identity.is_super_admin()
      OR identity.is_school_admin()
      OR EXISTS (
        SELECT 1 FROM identity.people p
        WHERE p.id = target_person_id
          AND p.school_id IN (SELECT identity.my_school_ids())
      )
      OR target_person_id = identity.my_person_id()
    )
  ORDER BY a.event_datetime DESC
  LIMIT 50;
$$;

CREATE OR REPLACE FUNCTION public.get_teacher_lesson_progress(target_person_id bigint)
RETURNS TABLE (
  course_title text,
  course_url text,
  lessons_completed integer,
  lessons_total integer,
  completion_pct numeric,
  snapshot_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (lc.course_url)
    lc.course_title, lc.course_url, lc.lessons_completed, lc.lessons_total,
    lc.completion_pct, lc.snapshot_date
  FROM fact.lms_completions lc
  WHERE lc.person_id = target_person_id
    AND (
      identity.is_super_admin()
      OR identity.is_school_admin()
      OR EXISTS (
        SELECT 1 FROM identity.people p
        WHERE p.id = target_person_id
          AND p.school_id IN (SELECT identity.my_school_ids())
      )
      OR target_person_id = identity.my_person_id()
    )
  ORDER BY lc.course_url, lc.snapshot_date DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_course_completion(target_course_url text)
RETURNS TABLE (
  person_id bigint,
  teacher_name text,
  school_id bigint,
  school_name text,
  course_title text,
  lessons_completed integer,
  lessons_total integer,
  completion_pct numeric,
  snapshot_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (lc.person_id)
    lc.person_id,
    p.canonical_full_name,
    p.school_id,
    s.school_name,
    lc.course_title,
    lc.lessons_completed,
    lc.lessons_total,
    lc.completion_pct,
    lc.snapshot_date
  FROM fact.lms_completions lc
  JOIN identity.people p ON p.id = lc.person_id
  LEFT JOIN identity.schools s ON s.id = p.school_id
  WHERE lc.course_url = target_course_url
    AND (
      identity.is_super_admin()
      OR identity.is_school_admin()
      OR p.school_id IN (SELECT identity.my_school_ids())
      OR lc.person_id = identity.my_person_id()
    )
  ORDER BY lc.person_id, lc.snapshot_date DESC;
$$;
