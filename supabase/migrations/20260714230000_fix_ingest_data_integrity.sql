-- Tier-1 data-integrity fixes found during a full calculations audit.
--
-- 1. admin_ingest_drived() deleted fact.school_usage_daily for a snapshot
--    date across ALL schools, then only re-inserted rows present in the
--    current payload. A partial re-upload (e.g. one corrected school) wiped
--    every other school's data for that date. Switch to a per-row UPSERT so
--    schools absent from a given payload are simply left untouched.
--
-- 2. fact.school_usage_daily had no unique key on (school_id, snapshot_date),
--    so a payload with a duplicate row created duplicate fact rows -- these
--    then won arbitrary tie-breaks in "latest snapshot" queries and doubled
--    points on the trend chart. Dedup existing rows and add the constraint
--    (also required for the UPSERT above).
--
-- 3. admin_ingest_product_fruits() had the same blanket-delete bug for
--    fact.product_fruits_activity. Scope its delete to the schools present
--    in the payload instead of every school.
--
-- 4. product_fruits_active_users (reporting.v_school_report) counted
--    DISTINCT person_id across *all* product_fruits_activity rows ever
--    loaded for a school, so it only ever grew and never reflected current
--    activity -- a lifetime total masquerading as a live count. Scope it to
--    each school's latest snapshot, matching how drived_latest already
--    works. Rows from before snapshot_date existed (added in migration
--    ...110000, never backfilled) have snapshot_date IS NULL; they now
--    naturally drop out of "latest" the moment a school gets its first
--    dated upload, and the ingest also retires them outright at that point
--    so they stop lingering in the table.

-- ---------- 1 & 2: dedupe + unique constraint on fact.school_usage_daily ----------
DELETE FROM fact.school_usage_daily a
USING fact.school_usage_daily b
WHERE a.school_id IS NOT NULL
  AND a.school_id = b.school_id
  AND a.snapshot_date = b.snapshot_date
  AND a.id < b.id;

ALTER TABLE fact.school_usage_daily
  ADD CONSTRAINT uq_school_usage_daily_school_date UNIQUE (school_id, snapshot_date);

-- ---------- Drive Ed ingest: upsert instead of blanket delete+insert ----------
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

  -- fact: upsert per (school_id, snapshot_date). Schools not present in this
  -- payload are untouched -- no blanket delete, so a partial/corrective
  -- re-upload can never erase another school's data for this date.
  INSERT INTO fact.school_usage_daily (school_id, drived_core_id, snapshot_date, users, invited, accepted, logged, studied)
  SELECT s.id, (r->>'core_id')::int, p_snapshot_date,
         (r->>'users')::int, (r->>'invited')::int, (r->>'accepted')::int,
         (r->>'logged')::int, (r->>'studied')::int
  FROM jsonb_array_elements(p_rows) r
  JOIN identity.schools s ON s.drived_core_id = (r->>'core_id')::int
  WHERE (r->>'core_id') ~ '^\d+$'
  ON CONFLICT (school_id, snapshot_date) DO UPDATE SET
    drived_core_id = EXCLUDED.drived_core_id,
    users = EXCLUDED.users, invited = EXCLUDED.invited, accepted = EXCLUDED.accepted,
    logged = EXCLUDED.logged, studied = EXCLUDED.studied;
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

-- ---------- Product Fruits ingest: scope the rebuild-delete to this payload's schools ----------
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

  -- 4. rebuild this snapshot's activity, scoped to the schools present in
  -- THIS payload -- a partial re-upload no longer wipes other schools'
  -- activity for the same date.
  DELETE FROM fact.product_fruits_activity
  WHERE snapshot_date = p_snapshot_date
    AND school_id IN (
      SELECT sch.id FROM jsonb_array_elements(p_rows) r
      JOIN identity.schools sch ON lower(btrim(sch.product_fruits_school_name)) = lower(btrim(r->>'school_name'))
      WHERE nullif(btrim(r->>'email'), '') IS NOT NULL
    );
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

  -- 5. retire pre-snapshot_date legacy rows for schools we just refreshed --
  -- a real dated snapshot now exists for them, so the old undated rows would
  -- otherwise sit in the table forever, permanently inflating "active users".
  DELETE FROM fact.product_fruits_activity
  WHERE snapshot_date IS NULL
    AND school_id IN (
      SELECT sch.id FROM jsonb_array_elements(p_rows) r
      JOIN identity.schools sch ON lower(btrim(sch.product_fruits_school_name)) = lower(btrim(r->>'school_name'))
      WHERE nullif(btrim(r->>'email'), '') IS NOT NULL
    );

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

-- ---------- v_school_report: active users scoped to each school's latest PF snapshot ----------
CREATE OR REPLACE VIEW reporting.v_school_report AS
WITH drived_latest AS (
  SELECT DISTINCT ON (school_usage_daily.school_id) school_usage_daily.school_id,
    school_usage_daily.snapshot_date, school_usage_daily.users, school_usage_daily.invited,
    school_usage_daily.accepted, school_usage_daily.logged, school_usage_daily.studied
  FROM fact.school_usage_daily
  WHERE school_usage_daily.school_id IS NOT NULL
  ORDER BY school_usage_daily.school_id, school_usage_daily.snapshot_date DESC
), pf_latest AS (
  SELECT DISTINCT ON (school_id) school_id, snapshot_date
  FROM fact.product_fruits_activity
  WHERE school_id IS NOT NULL
  ORDER BY school_id, snapshot_date DESC NULLS LAST
), product_fruits_agg AS (
  SELECT pfa.school_id,
    count(DISTINCT pfa.person_id) AS active_user_count,
    count(DISTINCT pfa.person_id) FILTER (WHERE lower(pfa.user_role) = 'teacher'::text) AS teacher_count,
    count(DISTINCT pfa.person_id) FILTER (WHERE lower(pfa.user_role) = 'school administrator'::text) AS admin_count,
    max(pfa.event_datetime) AS last_activity_at
  FROM fact.product_fruits_activity pfa
  JOIN pf_latest pl ON pl.school_id = pfa.school_id AND pfa.snapshot_date IS NOT DISTINCT FROM pl.snapshot_date
  WHERE pfa.school_id IS NOT NULL
  GROUP BY pfa.school_id
), catalog_progress AS (
  SELECT ca.person_id, ca.course_id, p.school_id,
    count(l.id) AS lessons_total,
    count(lp.id) AS lessons_completed
  FROM catalog.course_assignments ca
  JOIN identity.people p ON p.id = ca.person_id
  LEFT JOIN catalog.modules m ON m.course_id = ca.course_id
  LEFT JOIN catalog.lessons l ON l.module_id = m.id
  LEFT JOIN catalog.lesson_progress lp ON lp.lesson_id = l.id AND lp.person_id = ca.person_id
  WHERE p.school_id IS NOT NULL
  GROUP BY ca.person_id, ca.course_id, p.school_id
), catalog_agg AS (
  SELECT school_id,
    count(*)::bigint AS course_rows,
    sum(lessons_completed)::bigint AS total_lessons_completed,
    sum(lessons_total)::bigint AS total_lessons_assigned,
    round(CASE WHEN sum(lessons_total) > 0
               THEN 100.0 * sum(lessons_completed) / sum(lessons_total)
               ELSE 0 END, 1) AS avg_completion_pct
  FROM catalog_progress
  GROUP BY school_id
)
SELECT s.id AS school_id, s.school_name, s.drived_core_id,
  dl.snapshot_date AS drived_latest_snapshot_date,
  dl.users AS drived_users, dl.invited AS drived_invited, dl.accepted AS drived_accepted,
  dl.logged AS drived_logged, dl.studied AS drived_studied,
  pfa.active_user_count AS product_fruits_active_users,
  pfa.teacher_count AS product_fruits_teachers,
  pfa.admin_count AS product_fruits_admins,
  pfa.last_activity_at AS product_fruits_last_activity,
  ca.course_rows AS lms_course_rows,
  ca.total_lessons_completed, ca.total_lessons_assigned,
  ca.avg_completion_pct AS lms_avg_completion_pct
FROM identity.schools s
  LEFT JOIN drived_latest dl ON dl.school_id = s.id
  LEFT JOIN product_fruits_agg pfa ON pfa.school_id = s.id
  LEFT JOIN catalog_agg ca ON ca.school_id = s.id
ORDER BY s.school_name;
