-- Fix: identity.people.canonical_full_name is a GENERATED ALWAYS column
-- (TRIM(first_name || ' ' || surname)), so inserts must NOT write it — set
-- first_name/surname and let the DB derive it. Both teacher-creating RPCs
-- previously inserted canonical_full_name explicitly and errored.

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
  INSERT INTO identity.people (first_name, surname, primary_email, role, school_id)
  VALUES (
    btrim(p_first_name),
    btrim(p_surname),
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

CREATE OR REPLACE FUNCTION public.admin_match_create_teacher(p_queue_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text;
  v_name text;
  v_school_id bigint;
  v_new_id bigint;
BEGIN
  IF NOT identity.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING errcode = '42501';
  END IF;

  SELECT raw_identifier INTO v_raw
  FROM identity.match_review_queue
  WHERE id = p_queue_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue item not found or already resolved';
  END IF;

  v_name := initcap(lower(v_raw));

  SELECT s.id INTO v_school_id
  FROM fact.lms_completions lc
  JOIN identity.schools s
    ON lower(s.vimeo_source_url) = lower(substring(lc.course_url FROM 'https?://([^/]+)'))
  WHERE lc.teacher_name_raw = v_raw
  LIMIT 1;

  INSERT INTO identity.people (first_name, surname, role, school_id)
  VALUES (
    split_part(v_name, ' ', 1),
    nullif(btrim(substring(v_name FROM position(' ' IN v_name) + 1)), ''),
    'teacher',
    v_school_id
  )
  RETURNING id INTO v_new_id;

  PERFORM public.admin_match_resolve_to_person(p_queue_id, v_new_id, 'manual_create');
  RETURN v_new_id;
END;
$$;
