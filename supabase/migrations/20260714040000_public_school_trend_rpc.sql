-- Time-series data for a single school's trend page. Same access pattern as
-- get_my_school_report(): super admin sees any school, school admin only
-- their own.
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
      OR school_id IN (SELECT identity.my_school_ids())
    )
  ORDER BY snapshot_date;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_school_trend(bigint) TO authenticated;
