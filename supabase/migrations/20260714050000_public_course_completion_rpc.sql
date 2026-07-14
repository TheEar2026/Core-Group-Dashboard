-- Per-course completion breakdown across teachers, for the Course Detail
-- page. There is no lesson/video-level Vimeo join available (Vimeo
-- engagement is only captured at school granularity, not per course), so
-- this deliberately only surfaces LMS completion data, which is genuinely
-- joinable per person/course.
--
-- Access rule (same shape as the other detail RPCs): super admin sees every
-- teacher on this course; a school admin sees only their school's teachers;
-- a teacher sees at least their own row.
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
      OR p.school_id IN (SELECT identity.my_school_ids())
      OR lc.person_id = identity.my_person_id()
    )
  ORDER BY lc.person_id, lc.snapshot_date DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_course_completion(text) TO authenticated;
