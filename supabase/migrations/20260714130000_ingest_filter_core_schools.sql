-- Scope the org-wide uploads (Drive Ed, Product Fruits) to the 12 Core Group
-- schools. A real export lists every school in the company; anything that
-- doesn't match one of our schools is now skipped entirely -- no fact rows, no
-- auto-created people, no match-queue entries.
--
-- Both RPCs now return a jsonb summary instead of a bare count:
--   { "loaded": <rows written for our schools>,
--     "skipped": <rows dropped as belonging to other schools>,
--     "unmatched_schools": [ <distinct labels that didn't match> ] }
-- The unmatched list matters: if one of our 12 shows up there, its key is
-- mismatched (like the Thornview label was) rather than being an outside school.
--
-- LMS is intentionally left as-is: it's scraped per-school and its course_url
-- join key isn't validated against a real export yet, so a filter there could
-- silently drop everything. It gets the same treatment once we validate it.

-- ---------- DRIVE ED ----------
DROP FUNCTION IF EXISTS public.admin_ingest_drived(jsonb, date);
CREATE FUNCTION public.admin_ingest_drived(p_rows jsonb, p_snapshot_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer; v_skipped integer; v_unmatched jsonb;
BEGIN
  IF NOT identity.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING errcode = '42501';
  END IF;

  -- staging: only schools we know (matched by drived_core_id)
  INSERT INTO staging.stg_drived (core_id, name, snapshot_date, users, invited, accepted, logged, studied, source_file)
  SELECT (r->>'core_id')::int, r->>'name', p_snapshot_date,
         (r->>'users')::int, (r->>'invited')::int, (r->>'accepted')::int,
         (r->>'logged')::int, (r->>'studied')::int, 'settings-upload'
  FROM jsonb_array_elements(p_rows) r
  WHERE (r->>'core_id') ~ '^\d+$'
    AND EXISTS (SELECT 1 FROM identity.schools s WHERE s.drived_core_id = (r->>'core_id')::int)
  ON CONFLICT (core_id, snapshot_date) DO UPDATE SET
    users = EXCLUDED.users, invited = EXCLUDED.invited, accepted = EXCLUDED.accepted,
    logged = EXCLUDED.logged, studied = EXCLUDED.studied, name = EXCLUDED.name;

  DELETE FROM fact.school_usage_daily WHERE snapshot_date = p_snapshot_date;
  INSERT INTO fact.school_usage_daily (school_id, drived_core_id, snapshot_date, users, invited, accepted, logged, studied)
  SELECT s.id, (r->>'core_id')::int, p_snapshot_date,
         (r->>'users')::int, (r->>'invited')::int, (r->>'accepted')::int,
         (r->>'logged')::int, (r->>'studied')::int
  FROM jsonb_array_elements(p_rows) r
  JOIN identity.schools s ON s.drived_core_id = (r->>'core_id')::int
  WHERE (r->>'core_id') ~ '^\d+$';
  GET DIAGNOSTICS n = ROW_COUNT;

  SELECT count(*), coalesce(jsonb_agg(DISTINCT label), '[]'::jsonb)
    INTO v_skipped, v_unmatched
  FROM (
    SELECT coalesce(nullif(btrim(r->>'name'), ''), 'core_id ' || (r->>'core_id')) AS label
    FROM jsonb_array_elements(p_rows) r
    WHERE (r->>'core_id') ~ '^\d+$'
      AND NOT EXISTS (SELECT 1 FROM identity.schools s WHERE s.drived_core_id = (r->>'core_id')::int)
  ) q;

  RETURN jsonb_build_object('loaded', n, 'skipped', v_skipped, 'unmatched_schools', v_unmatched);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_ingest_drived(jsonb, date) TO authenticated;

-- ---------- PRODUCT FRUITS ----------
DROP FUNCTION IF EXISTS public.admin_ingest_product_fruits(jsonb, date);
CREATE FUNCTION public.admin_ingest_product_fruits(p_rows jsonb, p_snapshot_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer; v_skipped integer; v_unmatched jsonb;
BEGIN
  IF NOT identity.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING errcode = '42501';
  END IF;

  -- Rows count only if their school is one of ours. is_ours() below is the
  -- shared predicate, inlined as EXISTS on identity.schools.

  -- 1. staging: latest event per email, our schools only.
  INSERT INTO staging.stg_product_fruits (username, email_address, first_name, surname, full_name_raw,
         event_datetime_raw, user_role, school_name, product_type, billing_status, snapshot_date, source_file)
  SELECT DISTINCT ON (lower(btrim(r->>'email')))
         r->>'username', lower(btrim(r->>'email')), r->>'first_name', r->>'surname', r->>'full_name',
         r->>'event_datetime_raw', r->>'user_role', r->>'school_name', r->>'product_type', r->>'billing_status',
         p_snapshot_date, 'settings-upload'
  FROM jsonb_array_elements(p_rows) r
  WHERE nullif(btrim(r->>'email'), '') IS NOT NULL
    AND EXISTS (SELECT 1 FROM identity.schools s WHERE lower(btrim(s.product_fruits_school_name)) = lower(btrim(r->>'school_name')))
  ORDER BY lower(btrim(r->>'email')), identity.parse_pf_datetime(r->>'event_datetime_raw') DESC NULLS LAST
  ON CONFLICT (email_address, snapshot_date) DO UPDATE SET
    user_role = EXCLUDED.user_role, product_type = EXCLUDED.product_type,
    billing_status = EXCLUDED.billing_status, school_name = EXCLUDED.school_name,
    event_datetime_raw = EXCLUDED.event_datetime_raw, username = EXCLUDED.username,
    first_name = EXCLUDED.first_name, surname = EXCLUDED.surname, full_name_raw = EXCLUDED.full_name_raw;

  -- 2. auto-create identities for unseen emails at our schools (INNER JOIN filters).
  INSERT INTO identity.people (school_id, first_name, surname, primary_email, role, notes)
  SELECT DISTINCT ON (lower(btrim(r->>'email')))
         sch.id,
         nullif(btrim(r->>'first_name'), ''),
         nullif(btrim(r->>'surname'), ''),
         lower(btrim(r->>'email')),
         nullif(btrim(r->>'user_role'), ''),
         'auto-created from Product Fruits upload'
  FROM jsonb_array_elements(p_rows) r
  JOIN identity.schools sch ON lower(btrim(sch.product_fruits_school_name)) = lower(btrim(r->>'school_name'))
  WHERE nullif(btrim(r->>'email'), '') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM identity.people p WHERE lower(btrim(p.primary_email)) = lower(btrim(r->>'email')))
  ORDER BY lower(btrim(r->>'email'));

  -- 3. map PF email -> person, our schools only.
  INSERT INTO identity.person_source_map (person_id, source_system, raw_identifier, match_method, match_confidence)
  SELECT DISTINCT ON (lower(btrim(r->>'email')))
         p.id, 'product_fruits', lower(btrim(r->>'email')), 'auto_email', 1.0
  FROM jsonb_array_elements(p_rows) r
  JOIN identity.people p ON lower(btrim(p.primary_email)) = lower(btrim(r->>'email'))
  WHERE nullif(btrim(r->>'email'), '') IS NOT NULL
    AND EXISTS (SELECT 1 FROM identity.schools s WHERE lower(btrim(s.product_fruits_school_name)) = lower(btrim(r->>'school_name')))
    AND NOT EXISTS (
      SELECT 1 FROM identity.person_source_map psm
      WHERE psm.source_system = 'product_fruits' AND lower(btrim(psm.raw_identifier)) = lower(btrim(r->>'email'))
    )
  ORDER BY lower(btrim(r->>'email'))
  ON CONFLICT (source_system, raw_identifier) DO NOTHING;

  -- 4. rebuild this snapshot's activity, our schools only (INNER JOIN filters).
  DELETE FROM fact.product_fruits_activity WHERE snapshot_date = p_snapshot_date;
  INSERT INTO fact.product_fruits_activity (person_id, school_id, event_datetime, user_role, product_type, billing_status, snapshot_date)
  SELECT psm.person_id, sch.id,
         identity.parse_pf_datetime(r->>'event_datetime_raw'),
         r->>'user_role', r->>'product_type', r->>'billing_status', p_snapshot_date
  FROM jsonb_array_elements(p_rows) r
  JOIN identity.schools sch ON lower(btrim(sch.product_fruits_school_name)) = lower(btrim(r->>'school_name'))
  LEFT JOIN identity.person_source_map psm
    ON psm.source_system = 'product_fruits' AND lower(btrim(psm.raw_identifier)) = lower(btrim(r->>'email'))
  WHERE nullif(btrim(r->>'email'), '') IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;

  SELECT count(*), coalesce(jsonb_agg(DISTINCT label), '[]'::jsonb)
    INTO v_skipped, v_unmatched
  FROM (
    SELECT coalesce(nullif(btrim(r->>'school_name'), ''), '(blank school name)') AS label
    FROM jsonb_array_elements(p_rows) r
    WHERE nullif(btrim(r->>'email'), '') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM identity.schools s WHERE lower(btrim(s.product_fruits_school_name)) = lower(btrim(r->>'school_name')))
  ) q;

  RETURN jsonb_build_object('loaded', n, 'skipped', v_skipped, 'unmatched_schools', v_unmatched);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_ingest_product_fruits(jsonb, date) TO authenticated;
