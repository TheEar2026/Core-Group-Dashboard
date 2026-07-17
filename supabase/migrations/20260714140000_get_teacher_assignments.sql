-- Read a teacher's assigned grades + course names (the "linked to" list a
-- super-admin sets on the Manage page). Access-scoped the same way as the other
-- teacher RPCs: super-admin and school-admin see everyone; a teacher sees their
-- own; a school's rows are visible to that school. Ordered Grade R, 1..7, then
-- by course title.
CREATE OR REPLACE FUNCTION public.get_teacher_assignments(target_person_id bigint)
RETURNS TABLE(grade text, course_title text, school_id bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ta.grade, ta.course_title, ta.school_id
  FROM identity.teaching_assignments ta
  WHERE ta.person_id = target_person_id
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
  ORDER BY
    CASE
      WHEN upper(btrim(ta.grade)) IN ('R', 'GRADE R', 'GRADER') THEN 0
      WHEN substring(ta.grade FROM '(\d+)') ~ '^\d+$' THEN substring(ta.grade FROM '(\d+)')::int
      ELSE 99
    END,
    ta.course_title;
$$;
GRANT EXECUTE ON FUNCTION public.get_teacher_assignments(bigint) TO authenticated;
