-- Teacher-experience quick win: let a teacher bulk-tick (or un-tick, as
-- undo) every lesson in a module at once, instead of clicking each lesson
-- individually when catching up on several at a time. Mirrors
-- set_lesson_complete's own authorization checks.

CREATE OR REPLACE FUNCTION public.set_module_complete(p_module_id bigint, p_completed boolean)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_person bigint := identity.my_person_id(); v_course bigint; n int;
BEGIN
  IF v_person IS NULL THEN
    RAISE EXCEPTION 'No teacher profile for this account' USING errcode = '42501';
  END IF;

  SELECT m.course_id INTO v_course FROM catalog.modules m WHERE m.id = p_module_id;
  IF v_course IS NULL THEN
    RAISE EXCEPTION 'Unknown module';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM catalog.course_assignments ca
    WHERE ca.course_id = v_course AND ca.person_id = v_person
  ) THEN
    RAISE EXCEPTION 'You are not assigned this course' USING errcode = '42501';
  END IF;

  IF p_completed THEN
    INSERT INTO catalog.lesson_progress (person_id, lesson_id)
    SELECT v_person, l.id FROM catalog.lessons l WHERE l.module_id = p_module_id
    ON CONFLICT (person_id, lesson_id) DO NOTHING;
  ELSE
    DELETE FROM catalog.lesson_progress
    WHERE person_id = v_person
      AND lesson_id IN (SELECT id FROM catalog.lessons WHERE module_id = p_module_id);
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_module_complete(bigint, boolean) TO authenticated;
