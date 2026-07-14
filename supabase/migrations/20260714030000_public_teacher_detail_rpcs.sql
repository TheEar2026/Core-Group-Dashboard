-- Per-teacher drill-down data, exposed the same way as the other reports:
-- a SECURITY DEFINER function in public (the only API-exposed schema) that
-- enforces access explicitly, since the underlying fact tables aren't
-- reachable from the caller's own RLS-scoped role via this path.
--
-- Access rule (shared by both functions): the caller can see target_person_id
-- if they are a super admin, a school admin for that person's school, or the
-- person themselves (a teacher viewing their own record).

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

GRANT EXECUTE ON FUNCTION public.get_teacher_login_activity(bigint) TO authenticated;

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
      OR EXISTS (
        SELECT 1 FROM identity.people p
        WHERE p.id = target_person_id
          AND p.school_id IN (SELECT identity.my_school_ids())
      )
      OR target_person_id = identity.my_person_id()
    )
  ORDER BY lc.course_url, lc.snapshot_date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_teacher_lesson_progress(bigint) TO authenticated;
