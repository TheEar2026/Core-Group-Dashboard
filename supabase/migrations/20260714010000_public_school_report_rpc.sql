-- Only the `public` schema is exposed over PostgREST, so expose the school
-- report through a SECURITY DEFINER function scoped to the caller's schools.
-- The underlying view/tables are not RLS-protected against this function
-- (SECURITY DEFINER runs as the function owner), so scoping is enforced
-- explicitly here instead of relying on row level security.
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
     OR school_id IN (SELECT identity.my_school_ids());
$$;

GRANT EXECUTE ON FUNCTION public.get_my_school_report() TO authenticated;
