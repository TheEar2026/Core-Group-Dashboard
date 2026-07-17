-- Support super-admin authoring + teacher login provisioning.

-- Teachers assigned to a course (for the Manage course page).
CREATE OR REPLACE FUNCTION public.admin_list_course_teachers(p_course_id bigint)
RETURNS TABLE(person_id bigint, teacher_name text, primary_email text, school_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.canonical_full_name, p.primary_email, s.school_name
  FROM catalog.course_assignments ca
  JOIN identity.people p ON p.id = ca.person_id
  LEFT JOIN identity.schools s ON s.id = p.school_id
  WHERE ca.course_id = p_course_id AND identity.is_super_admin()
  ORDER BY p.canonical_full_name;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_course_teachers(bigint) TO authenticated;

-- Link a person to an auth login (the auth user itself is created via the
-- GoTrue admin API from a server action). Idempotent.
CREATE OR REPLACE FUNCTION public.admin_link_teacher_login(p_person_id bigint, p_auth_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT identity.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.people WHERE id = p_person_id) THEN
    RAISE EXCEPTION 'Unknown person';
  END IF;
  INSERT INTO identity.teacher_users (auth_user_id, person_id)
  VALUES (p_auth_user_id, p_person_id)
  ON CONFLICT (auth_user_id) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_link_teacher_login(bigint, uuid) TO authenticated;

-- Which teachers already have a login (so the UI can show status).
CREATE OR REPLACE FUNCTION public.admin_list_teacher_logins()
RETURNS TABLE(person_id bigint, teacher_name text, primary_email text, school_name text, has_login boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.canonical_full_name, p.primary_email, s.school_name,
    EXISTS (SELECT 1 FROM identity.teacher_users tu WHERE tu.person_id = p.id) AS has_login
  FROM identity.people p
  LEFT JOIN identity.schools s ON s.id = p.school_id
  WHERE identity.is_super_admin() AND lower(coalesce(p.role,'')) = 'teacher'
  ORDER BY p.canonical_full_name;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_teacher_logins() TO authenticated;
