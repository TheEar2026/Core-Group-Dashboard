-- Only the `public` schema is exposed over PostgREST, so expose the teacher
-- report through a SECURITY DEFINER function scoped to the caller's schools.
-- Super admins see every teacher; school admins see only their school(s).
-- Teachers (no school_admin row) match no schools and therefore see nothing.
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
     OR school_id IN (SELECT identity.my_school_ids());
$$;

GRANT EXECUTE ON FUNCTION public.get_my_teacher_report() TO authenticated;
