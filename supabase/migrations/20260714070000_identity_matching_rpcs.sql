-- Identity-resolution / match-review RPCs (super-admin only).
-- Resolves the pending identity.match_review_queue items (LMS teacher names
-- with no person record yet) into real people, wires person_source_map, and
-- backfills fact.lms_completions.person_id. Also backfills Product Fruits
-- activity school_id from the staging school name.
--
-- LMS school is derived from the course_url domain, which maps to
-- identity.schools.vimeo_source_url (same per-school subdomain).

-- List pending queue items, enriched with the detected school + a
-- canonicalised (Title Case) suggested name.
CREATE OR REPLACE FUNCTION public.admin_list_match_queue()
RETURNS TABLE (
  id bigint,
  source_system text,
  raw_identifier text,
  suggested_name text,
  detected_school_id bigint,
  detected_school_name text,
  fact_rows bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    q.id,
    q.source_system,
    q.raw_identifier,
    initcap(lower(q.raw_identifier)) AS suggested_name,
    ds.school_id,
    ds.school_name,
    (SELECT count(*) FROM fact.lms_completions lc WHERE lc.teacher_name_raw = q.raw_identifier) AS fact_rows
  FROM identity.match_review_queue q
  LEFT JOIN LATERAL (
    SELECT s.id AS school_id, s.school_name
    FROM fact.lms_completions lc
    JOIN identity.schools s
      ON lower(s.vimeo_source_url) = lower(substring(lc.course_url FROM 'https?://([^/]+)'))
    WHERE lc.teacher_name_raw = q.raw_identifier
    LIMIT 1
  ) ds ON true
  WHERE identity.is_super_admin()
    AND q.status = 'pending'
  ORDER BY q.raw_identifier;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_match_queue() TO authenticated;

-- Internal helper: resolve one queue item to a given (existing) person,
-- wire the source map, backfill LMS facts, and mark the item resolved.
CREATE OR REPLACE FUNCTION public.admin_match_resolve_to_person(
  p_queue_id bigint,
  p_person_id bigint,
  p_method text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text;
  v_source text;
  v_email text;
BEGIN
  IF NOT identity.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING errcode = '42501';
  END IF;

  SELECT raw_identifier, source_system INTO v_raw, v_source
  FROM identity.match_review_queue
  WHERE id = p_queue_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue item not found or already resolved';
  END IF;

  INSERT INTO identity.person_source_map (person_id, source_system, raw_identifier, match_method)
  VALUES (p_person_id, v_source, v_raw, p_method)
  ON CONFLICT (source_system, raw_identifier) DO UPDATE SET person_id = EXCLUDED.person_id;

  IF v_source = 'lms' THEN
    UPDATE fact.lms_completions
    SET person_id = p_person_id
    WHERE teacher_name_raw = v_raw AND person_id IS DISTINCT FROM p_person_id;
  END IF;

  v_email := (SELECT email FROM identity.super_admin_users WHERE auth_user_id = auth.uid() LIMIT 1);
  UPDATE identity.match_review_queue
  SET status = 'resolved', candidate_person_id = p_person_id, reviewed_by = v_email, reviewed_at = now()
  WHERE id = p_queue_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_match_resolve_to_person(bigint, bigint, text) TO authenticated;

-- Create a brand-new teacher from a queue item (at its detected school) and
-- resolve to it. Returns the new person id.
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

  INSERT INTO identity.people (first_name, surname, canonical_full_name, role, school_id)
  VALUES (
    split_part(v_name, ' ', 1),
    nullif(btrim(substring(v_name FROM position(' ' IN v_name) + 1)), ''),
    v_name,
    'teacher',
    v_school_id
  )
  RETURNING id INTO v_new_id;

  PERFORM public.admin_match_resolve_to_person(p_queue_id, v_new_id, 'manual_create');
  RETURN v_new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_match_create_teacher(bigint) TO authenticated;

-- Link a queue item to an existing person instead of creating one.
CREATE OR REPLACE FUNCTION public.admin_match_link_existing(p_queue_id bigint, p_person_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.admin_match_resolve_to_person(p_queue_id, p_person_id, 'manual_link');
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_match_link_existing(bigint, bigint) TO authenticated;

-- Bulk fast path: create a new teacher for every pending queue item.
CREATE OR REPLACE FUNCTION public.admin_match_create_all()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  IF NOT identity.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING errcode = '42501';
  END IF;
  FOR r IN SELECT id FROM identity.match_review_queue WHERE status = 'pending' ORDER BY id LOOP
    PERFORM public.admin_match_create_teacher(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_match_create_all() TO authenticated;

-- Backfill Product Fruits activity school_id (and the person's school) from
-- the staging school name mapped to schools.product_fruits_school_name.
CREATE OR REPLACE FUNCTION public.admin_backfill_pf_schools()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NOT identity.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING errcode = '42501';
  END IF;

  WITH pf AS (
    SELECT psm.person_id, sch.id AS school_id
    FROM identity.person_source_map psm
    JOIN staging.stg_product_fruits sp
      ON lower(btrim(sp.email_address)) = lower(btrim(psm.raw_identifier))
    JOIN identity.schools sch
      ON lower(btrim(sch.product_fruits_school_name)) = lower(btrim(sp.school_name))
    WHERE psm.source_system = 'product_fruits'
  )
  UPDATE fact.product_fruits_activity a
  SET school_id = pf.school_id
  FROM pf
  WHERE a.person_id = pf.person_id AND a.school_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;

  -- Also set the person's own school when still unassigned.
  UPDATE identity.people p
  SET school_id = pf.school_id
  FROM (
    SELECT psm.person_id, sch.id AS school_id
    FROM identity.person_source_map psm
    JOIN staging.stg_product_fruits sp
      ON lower(btrim(sp.email_address)) = lower(btrim(psm.raw_identifier))
    JOIN identity.schools sch
      ON lower(btrim(sch.product_fruits_school_name)) = lower(btrim(sp.school_name))
    WHERE psm.source_system = 'product_fruits'
  ) pf
  WHERE p.id = pf.person_id AND p.school_id IS NULL;

  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_backfill_pf_schools() TO authenticated;
