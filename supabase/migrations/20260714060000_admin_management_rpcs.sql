-- Super-admin management RPCs. All are SECURITY DEFINER and hard-gate on
-- identity.is_super_admin(); a non-super-admin caller gets a 42501 error.
-- These make the dashboard a read/write management tool for the super admin
-- (create schools, create teachers, assign teachers to schools + courses).
-- Primary keys are GENERATED ALWAYS AS IDENTITY, so inserts never supply id.

-- Current caller's role, for nav + route guards.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN identity.is_super_admin() THEN 'super_admin'
    WHEN EXISTS (SELECT 1 FROM identity.school_admin_users WHERE auth_user_id = auth.uid()) THEN 'school_admin'
    WHEN identity.my_person_id() IS NOT NULL THEN 'teacher'
    ELSE NULL
  END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- ---- List helpers (super-admin only; include records with no activity yet) ----

CREATE OR REPLACE FUNCTION public.admin_list_schools()
RETURNS TABLE (id bigint, school_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.school_name
  FROM identity.schools s
  WHERE identity.is_super_admin()
  ORDER BY s.school_name;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_schools() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_teachers()
RETURNS TABLE (id bigint, teacher_name text, primary_email text, school_id bigint, school_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.canonical_full_name, p.primary_email, p.school_id, s.school_name
  FROM identity.people p
  LEFT JOIN identity.schools s ON s.id = p.school_id
  WHERE identity.is_super_admin()
    AND lower(coalesce(p.role, '')) = 'teacher'
  ORDER BY p.canonical_full_name;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_teachers() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_assignments()
RETURNS TABLE (
  id bigint,
  person_id bigint,
  teacher_name text,
  school_id bigint,
  school_name text,
  grade text,
  course_title text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ta.id, ta.person_id, p.canonical_full_name, ta.school_id, s.school_name,
         ta.grade, ta.course_title
  FROM identity.teaching_assignments ta
  JOIN identity.people p ON p.id = ta.person_id
  LEFT JOIN identity.schools s ON s.id = ta.school_id
  WHERE identity.is_super_admin()
  ORDER BY p.canonical_full_name, ta.course_title;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_assignments() TO authenticated;

-- ---- Mutations ----

CREATE OR REPLACE FUNCTION public.admin_create_school(
  p_school_name text,
  p_drived_core_id integer DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_id bigint;
BEGIN
  IF NOT identity.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING errcode = '42501';
  END IF;
  IF p_school_name IS NULL OR btrim(p_school_name) = '' THEN
    RAISE EXCEPTION 'School name is required';
  END IF;
  INSERT INTO identity.schools (school_name, drived_core_id, notes)
  VALUES (btrim(p_school_name), p_drived_core_id, p_notes)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_create_school(text, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_teacher(
  p_first_name text,
  p_surname text,
  p_primary_email text DEFAULT NULL,
  p_school_id bigint DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_id bigint;
BEGIN
  IF NOT identity.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING errcode = '42501';
  END IF;
  IF p_first_name IS NULL OR btrim(p_first_name) = '' OR p_surname IS NULL OR btrim(p_surname) = '' THEN
    RAISE EXCEPTION 'First name and surname are required';
  END IF;
  INSERT INTO identity.people (first_name, surname, canonical_full_name, primary_email, role, school_id)
  VALUES (
    btrim(p_first_name),
    btrim(p_surname),
    btrim(p_first_name) || ' ' || btrim(p_surname),
    nullif(btrim(coalesce(p_primary_email, '')), ''),
    'teacher',
    p_school_id
  )
  RETURNING id INTO new_id;
  RETURN new_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A person with that email already exists';
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_create_teacher(text, text, text, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_assign_teacher_school(
  p_person_id bigint,
  p_school_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT identity.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING errcode = '42501';
  END IF;
  UPDATE identity.people SET school_id = p_school_id WHERE id = p_person_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Teacher not found';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_assign_teacher_school(bigint, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_assign_course(
  p_person_id bigint,
  p_school_id bigint,
  p_grade text,
  p_course_title text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_id bigint;
BEGIN
  IF NOT identity.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING errcode = '42501';
  END IF;
  IF p_grade IS NULL OR btrim(p_grade) = '' OR p_course_title IS NULL OR btrim(p_course_title) = '' THEN
    RAISE EXCEPTION 'Grade and course title are required';
  END IF;
  INSERT INTO identity.teaching_assignments (person_id, school_id, grade, course_title, assigned_by)
  VALUES (
    p_person_id,
    p_school_id,
    btrim(p_grade),
    btrim(p_course_title),
    coalesce((SELECT email FROM identity.super_admin_users WHERE auth_user_id = auth.uid() LIMIT 1), auth.uid()::text)
  )
  ON CONFLICT (person_id, school_id, grade, course_title) DO UPDATE SET grade = EXCLUDED.grade
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_assign_course(bigint, bigint, text, text) TO authenticated;
