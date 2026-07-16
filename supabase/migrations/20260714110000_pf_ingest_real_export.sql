-- Rework the Product Fruits ingest to match a real PF "Usage Report" export
-- and to seed identities from it.
--
-- Real export columns (sheet "Raw Data"):
--   Username | Email Address | First Name | Surname | Full Name |
--   UserRoles | Date & Time | School Name
--
-- Three problems with the first-pass ingest, fixed here:
--  1. "Date & Time" is human formatted ("Tuesday, 02 June 2026 at 09:47"),
--     which does not cast to timestamptz -> the whole upload errored. We now
--     parse it with identity.parse_pf_datetime().
--  2. product_fruits_activity had no snapshot_date, and idempotency deleted by
--     event_datetime::date = snapshot -- wrong for a report that spans a date
--     range. We add snapshot_date and rebuild by it, like the other sources.
--  3. PF users weren't in identity.people, so person_id was null and the
--     dashboard's active-user / teacher counts (keyed on person_id) read ~0.
--     PF has email (unique) + names + school + role, so we auto-create a
--     person for every unseen email and map PF email -> person.

-- ---- snapshot_date for idempotent rebuilds ----
ALTER TABLE fact.product_fruits_activity
  ADD COLUMN IF NOT EXISTS snapshot_date date;

CREATE INDEX IF NOT EXISTS idx_pf_activity_snapshot_date
  ON fact.product_fruits_activity USING btree (snapshot_date);

-- ---- The real export uses PF's own school label; align the join key ----
UPDATE identity.schools
   SET product_fruits_school_name = 'Acudeo Thornview'
 WHERE product_fruits_school_name = 'Acudeo Thornview Primary & Secondary School';

-- ---- Robust parser for the PF human date format ----
-- "Tuesday, 02 June 2026 at 09:47" -> timestamptz. Falls back to a plain cast
-- for ISO-ish strings, and returns NULL (never throws) on anything else so one
-- bad cell can't abort a whole upload.
CREATE OR REPLACE FUNCTION identity.parse_pf_datetime(p_raw text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  s text := btrim(coalesce(p_raw, ''));
  cleaned text;
BEGIN
  IF s = '' THEN
    RETURN NULL;
  END IF;

  -- Leading weekday name + comma => the PF human format.
  IF s ~ '^[A-Za-z]+,' THEN
    cleaned := regexp_replace(s, '^[A-Za-z]+,\s*', '');          -- drop "Tuesday, "
    cleaned := regexp_replace(cleaned, '\s+[Aa][Tt]\s+', ' ');   -- " at " -> " "
    BEGIN
      RETURN to_timestamp(cleaned, 'DD Month YYYY HH24:MI');
    EXCEPTION WHEN OTHERS THEN
      -- fall through to a generic cast
    END;
  END IF;

  BEGIN
    RETURN s::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

-- ---- Rebuilt Product Fruits ingest ----
CREATE OR REPLACE FUNCTION public.admin_ingest_product_fruits(p_rows jsonb, p_snapshot_date date)
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

  -- 1. Raw staging: one row per email per snapshot. A PF export has multiple
  --    rows per user (one per login event), so collapse to the latest event
  --    per email before upserting into the (email, snapshot) unique key.
  INSERT INTO staging.stg_product_fruits (username, email_address, first_name, surname, full_name_raw,
         event_datetime_raw, user_role, school_name, product_type, billing_status, snapshot_date, source_file)
  SELECT DISTINCT ON (lower(btrim(r->>'email')))
         r->>'username', lower(btrim(r->>'email')), r->>'first_name', r->>'surname', r->>'full_name',
         r->>'event_datetime_raw', r->>'user_role', r->>'school_name', r->>'product_type', r->>'billing_status',
         p_snapshot_date, 'settings-upload'
  FROM jsonb_array_elements(p_rows) r
  WHERE nullif(btrim(r->>'email'), '') IS NOT NULL
  ORDER BY lower(btrim(r->>'email')), identity.parse_pf_datetime(r->>'event_datetime_raw') DESC NULLS LAST
  ON CONFLICT (email_address, snapshot_date) DO UPDATE SET
    user_role = EXCLUDED.user_role, product_type = EXCLUDED.product_type,
    billing_status = EXCLUDED.billing_status, school_name = EXCLUDED.school_name,
    event_datetime_raw = EXCLUDED.event_datetime_raw, username = EXCLUDED.username,
    first_name = EXCLUDED.first_name, surname = EXCLUDED.surname, full_name_raw = EXCLUDED.full_name_raw;

  -- 2. Auto-create an identity for every PF email we don't already have.
  --    primary_email is unique, so re-uploads never duplicate. school_id is
  --    resolved from the PF school label; role is carried straight from PF.
  INSERT INTO identity.people (school_id, first_name, surname, primary_email, role, notes)
  SELECT DISTINCT ON (lower(btrim(r->>'email')))
         sch.id,
         nullif(btrim(r->>'first_name'), ''),
         nullif(btrim(r->>'surname'), ''),
         lower(btrim(r->>'email')),
         nullif(btrim(r->>'user_role'), ''),
         'auto-created from Product Fruits upload'
  FROM jsonb_array_elements(p_rows) r
  LEFT JOIN identity.schools sch
    ON lower(btrim(sch.product_fruits_school_name)) = lower(btrim(r->>'school_name'))
  WHERE nullif(btrim(r->>'email'), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM identity.people p
      WHERE lower(btrim(p.primary_email)) = lower(btrim(r->>'email'))
    )
  ORDER BY lower(btrim(r->>'email'));

  -- 3. Map PF email -> person for new and pre-existing people alike.
  INSERT INTO identity.person_source_map (person_id, source_system, raw_identifier, match_method, match_confidence)
  SELECT DISTINCT ON (lower(btrim(r->>'email')))
         p.id, 'product_fruits', lower(btrim(r->>'email')), 'auto_email', 1.0
  FROM jsonb_array_elements(p_rows) r
  JOIN identity.people p
    ON lower(btrim(p.primary_email)) = lower(btrim(r->>'email'))
  WHERE nullif(btrim(r->>'email'), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM identity.person_source_map psm
      WHERE psm.source_system = 'product_fruits'
        AND lower(btrim(psm.raw_identifier)) = lower(btrim(r->>'email'))
    )
  ORDER BY lower(btrim(r->>'email'))
  ON CONFLICT (source_system, raw_identifier) DO NOTHING;

  -- 4. Rebuild this snapshot's activity rows.
  DELETE FROM fact.product_fruits_activity WHERE snapshot_date = p_snapshot_date;

  INSERT INTO fact.product_fruits_activity (person_id, school_id, event_datetime, user_role, product_type, billing_status, snapshot_date)
  SELECT psm.person_id, sch.id,
         identity.parse_pf_datetime(r->>'event_datetime_raw'),
         r->>'user_role', r->>'product_type', r->>'billing_status', p_snapshot_date
  FROM jsonb_array_elements(p_rows) r
  LEFT JOIN identity.person_source_map psm
    ON psm.source_system = 'product_fruits' AND lower(btrim(psm.raw_identifier)) = lower(btrim(r->>'email'))
  LEFT JOIN identity.schools sch
    ON lower(btrim(sch.product_fruits_school_name)) = lower(btrim(r->>'school_name'))
  WHERE nullif(btrim(r->>'email'), '') IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_ingest_product_fruits(jsonb, date) TO authenticated;
