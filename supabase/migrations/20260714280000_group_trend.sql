-- Group-wide trend for the Analytics page. Each school already has its own
-- trend chart (v_school_trend / get_my_school_trend, on /schools/[id]); this
-- aggregates across every school per snapshot date so Analytics can show
-- progress building up over time, not just today's snapshot.

CREATE OR REPLACE VIEW reporting.v_group_trend AS
SELECT snapshot_date,
  sum(drived_users) AS drived_users,
  sum(drived_invited) AS drived_invited,
  sum(drived_accepted) AS drived_accepted,
  sum(drived_logged) AS drived_logged,
  sum(drived_studied) AS drived_studied,
  sum(total_lessons_completed) AS total_lessons_completed,
  sum(total_lessons_assigned) AS total_lessons_assigned,
  round(100.0 * sum(total_lessons_completed) / nullif(sum(total_lessons_assigned), 0), 1) AS lms_avg_completion_pct
FROM reporting.v_school_trend
GROUP BY snapshot_date
ORDER BY snapshot_date;

CREATE OR REPLACE FUNCTION public.get_my_group_trend()
RETURNS SETOF reporting.v_group_trend
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM reporting.v_group_trend
  WHERE identity.is_super_admin() OR identity.is_school_admin();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_group_trend() TO authenticated;
