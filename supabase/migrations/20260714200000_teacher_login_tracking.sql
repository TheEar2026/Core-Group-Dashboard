-- Track real app logins (not Product Fruits activity, which is a separate
-- third-party system). Supabase's own auth audit log is empty on this project
-- tier, so we record logins ourselves.
--
-- This gives teachers visibility into their own login count/last login on
-- My Courses, and rolls the same figures up into the Teacher Report that
-- super-admins and school-admins see across all 12 schools.

CREATE TABLE identity.login_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_events_auth_user ON identity.login_events(auth_user_id);
ALTER TABLE identity.login_events ENABLE ROW LEVEL SECURITY;

-- Called right after a successful sign-in. Records the caller's own login;
-- no cross-user access, so no extra authorization check needed.
CREATE OR REPLACE FUNCTION public.record_login()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO identity.login_events (auth_user_id) VALUES (auth.uid());
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_login() TO authenticated;

-- My own login stats (for My Courses).
CREATE OR REPLACE FUNCTION public.get_my_login_stats()
RETURNS TABLE(login_count bigint, last_login_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*), max(created_at) FROM identity.login_events WHERE auth_user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_login_stats() TO authenticated;

-- Staff view of one teacher's login history (same access rule as the other
-- teacher RPCs: super-admin/school-admin see anyone; a teacher sees their own).
CREATE OR REPLACE FUNCTION public.get_teacher_login_history(target_person_id bigint)
RETURNS TABLE(logged_in_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT le.created_at
  FROM identity.teacher_users tu
  JOIN identity.login_events le ON le.auth_user_id = tu.auth_user_id
  WHERE tu.person_id = target_person_id
    AND (
      identity.is_super_admin()
      OR identity.is_school_admin()
      OR EXISTS (
        SELECT 1 FROM identity.people p
        WHERE p.id = target_person_id AND p.school_id IN (SELECT identity.my_school_ids())
      )
      OR target_person_id = identity.my_person_id()
    )
  ORDER BY le.created_at DESC
  LIMIT 20;
$$;
GRANT EXECUTE ON FUNCTION public.get_teacher_login_history(bigint) TO authenticated;

-- ---------- Roll login stats into the Teacher Report ----------
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
)
SELECT p.id AS person_id, p.canonical_full_name AS teacher_name, p.primary_email, p.school_id, s.school_name,
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
  LEFT JOIN fact.product_fruits_activity pfa ON pfa.person_id = p.id
WHERE lower(p.role) = 'teacher'::text
GROUP BY p.id, p.canonical_full_name, p.primary_email, p.school_id, s.school_name,
  cp.course_rows, cp.total_lessons_completed, cp.total_lessons_assigned, cp.avg_completion_pct,
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
