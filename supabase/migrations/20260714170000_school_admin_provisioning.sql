-- Provisioning for school-admin logins (mirrors the teacher-login flow).
-- The auth user is created via the GoTrue admin API in a server action; these
-- RPCs link it and list existing school admins. School admins get read-only
-- oversight of all 12 schools regardless of the school_id stored here, so the
-- school is just a "home" anchor for the record.

CREATE OR REPLACE FUNCTION public.admin_create_school_admin_link(p_auth_user_id uuid, p_school_id bigint, p_email text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT identity.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.schools WHERE id = p_school_id) THEN
    RAISE EXCEPTION 'Unknown school';
  END IF;
  INSERT INTO identity.school_admin_users (auth_user_id, school_id, email)
  VALUES (p_auth_user_id, p_school_id, lower(btrim(p_email)))
  ON CONFLICT (auth_user_id, school_id) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_create_school_admin_link(uuid, bigint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_school_admins()
RETURNS TABLE(email text, school_name text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT sa.email, s.school_name, sa.created_at
  FROM identity.school_admin_users sa
  LEFT JOIN identity.schools s ON s.id = sa.school_id
  WHERE identity.is_super_admin()
  ORDER BY sa.email;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_school_admins() TO authenticated;
