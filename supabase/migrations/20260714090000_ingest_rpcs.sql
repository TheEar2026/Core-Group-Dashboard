-- Data-ingest RPCs (super-admin only). Each takes a JSONB array of already
-- column-mapped rows (the app maps the uploaded CSV headers to these canonical
-- field names before calling) plus a snapshot date, loads staging, and
-- upserts fact — resolving school_id / person_id the same way the reporting
-- and matching layers do.
--
-- Idempotency: fact tables have no natural unique key, and a daily export is a
-- full snapshot, so each source deletes the snapshot's existing fact rows for
-- that date and re-inserts. Re-uploading a day is therefore safe.

-- ---------- DRIVE ED (school-level) ----------
CREATE OR REPLACE FUNCTION public.admin_ingest_drived(p_rows jsonb, p_snapshot_date date)
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

  -- staging (idempotent on core_id + date)
  INSERT INTO staging.stg_drived (core_id, name, snapshot_date, users, invited, accepted, logged, studied, source_file)
  SELECT (r->>'core_id')::int, r->>'name', p_snapshot_date,
         (r->>'users')::int, (r->>'invited')::int, (r->>'accepted')::int,
         (r->>'logged')::int, (r->>'studied')::int, 'settings-upload'
  FROM jsonb_array_elements(p_rows) r
  WHERE (r->>'core_id') ~ '^\d+$'
  ON CONFLICT (core_id, snapshot_date) DO UPDATE SET
    users = EXCLUDED.users, invited = EXCLUDED.invited, accepted = EXCLUDED.accepted,
    logged = EXCLUDED.logged, studied = EXCLUDED.studied, name = EXCLUDED.name;

  -- fact (replace this snapshot day)
  DELETE FROM fact.school_usage_daily WHERE snapshot_date = p_snapshot_date;
  INSERT INTO fact.school_usage_daily (school_id, drived_core_id, snapshot_date, users, invited, accepted, logged, studied)
  SELECT s.id, (r->>'core_id')::int, p_snapshot_date,
         (r->>'users')::int, (r->>'invited')::int, (r->>'accepted')::int,
         (r->>'logged')::int, (r->>'studied')::int
  FROM jsonb_array_elements(p_rows) r
  LEFT JOIN identity.schools s ON s.drived_core_id = (r->>'core_id')::int
  WHERE (r->>'core_id') ~ '^\d+$';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_ingest_drived(jsonb, date) TO authenticated;

-- ---------- VIMEO (school-level) ----------
CREATE OR REPLACE FUNCTION public.admin_ingest_vimeo(p_rows jsonb, p_snapshot_date date)
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

  INSERT INTO staging.stg_vimeo (source_url, views, impressions, unique_impressions, unique_viewers,
         total_time_watched_seconds, avg_time_watched_seconds, avg_pct_watched, finishes, downloads, snapshot_date, source_file)
  SELECT lower(btrim(r->>'source_url')),
         (r->>'views')::int, (r->>'impressions')::int, (r->>'unique_impressions')::int, (r->>'unique_viewers')::int,
         (r->>'total_time_watched_seconds')::int, (r->>'avg_time_watched_seconds')::int,
         nullif(r->>'avg_pct_watched','')::numeric, (r->>'finishes')::int, (r->>'downloads')::int,
         p_snapshot_date, 'settings-upload'
  FROM jsonb_array_elements(p_rows) r
  WHERE nullif(btrim(r->>'source_url'), '') IS NOT NULL
  ON CONFLICT (source_url, snapshot_date) DO UPDATE SET
    views = EXCLUDED.views, impressions = EXCLUDED.impressions, unique_impressions = EXCLUDED.unique_impressions,
    unique_viewers = EXCLUDED.unique_viewers, total_time_watched_seconds = EXCLUDED.total_time_watched_seconds,
    avg_time_watched_seconds = EXCLUDED.avg_time_watched_seconds, avg_pct_watched = EXCLUDED.avg_pct_watched,
    finishes = EXCLUDED.finishes, downloads = EXCLUDED.downloads;

  DELETE FROM fact.school_video_engagement WHERE snapshot_date = p_snapshot_date;
  INSERT INTO fact.school_video_engagement (school_id, source_url, views, impressions, unique_impressions, unique_viewers,
         total_time_watched_seconds, avg_time_watched_seconds, avg_pct_watched, finishes, downloads, snapshot_date)
  SELECT s.id, lower(btrim(r->>'source_url')),
         (r->>'views')::int, (r->>'impressions')::int, (r->>'unique_impressions')::int, (r->>'unique_viewers')::int,
         (r->>'total_time_watched_seconds')::int, (r->>'avg_time_watched_seconds')::int,
         nullif(r->>'avg_pct_watched','')::numeric, (r->>'finishes')::int, (r->>'downloads')::int, p_snapshot_date
  FROM jsonb_array_elements(p_rows) r
  JOIN identity.schools s ON lower(btrim(s.vimeo_source_url)) = lower(btrim(r->>'source_url'))
  WHERE nullif(btrim(r->>'source_url'), '') IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_ingest_vimeo(jsonb, date) TO authenticated;

-- ---------- PRODUCT FRUITS (person-level) ----------
-- Loads staging, then rebuilds this day's activity. person_id resolved from
-- person_source_map (source 'product_fruits', keyed on email); school_id from
-- product_fruits_school_name. Unresolved rows keep null ids (Match Review /
-- the backfill RPC handle them later). event_datetime parsed leniently.
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

  INSERT INTO staging.stg_product_fruits (username, email_address, first_name, surname, full_name_raw,
         event_datetime_raw, user_role, school_name, product_type, billing_status, snapshot_date, source_file)
  SELECT r->>'username', lower(btrim(r->>'email')), r->>'first_name', r->>'surname', r->>'full_name',
         r->>'event_datetime_raw', r->>'user_role', r->>'school_name', r->>'product_type', r->>'billing_status',
         p_snapshot_date, 'settings-upload'
  FROM jsonb_array_elements(p_rows) r
  WHERE nullif(btrim(r->>'email'), '') IS NOT NULL
  ON CONFLICT (email_address, snapshot_date) DO UPDATE SET
    user_role = EXCLUDED.user_role, product_type = EXCLUDED.product_type,
    billing_status = EXCLUDED.billing_status, school_name = EXCLUDED.school_name,
    event_datetime_raw = EXCLUDED.event_datetime_raw;

  DELETE FROM fact.product_fruits_activity
  WHERE event_datetime IS NOT NULL AND event_datetime::date = p_snapshot_date;

  INSERT INTO fact.product_fruits_activity (person_id, school_id, event_datetime, user_role, product_type, billing_status)
  SELECT psm.person_id, sch.id,
         (nullif(btrim(r->>'event_datetime_raw'), ''))::timestamptz,
         r->>'user_role', r->>'product_type', r->>'billing_status'
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

-- ---------- LMS lesson progress (person-level, scraped) ----------
-- Loads staging, rebuilds this day's completions, resolves teacher -> person
-- via person_source_map (source 'lms'), and queues any unmatched teacher name
-- for Match Review. lessons_completed_raw is parsed as "<done>/<total>".
CREATE OR REPLACE FUNCTION public.admin_ingest_lms(p_rows jsonb, p_snapshot_date date)
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

  INSERT INTO staging.stg_lms (course_name_raw, course_url, course_image, teacher_name_raw, lessons_completed_raw, snapshot_date, source_file)
  SELECT r->>'course_name', r->>'course_url', r->>'course_image', btrim(r->>'teacher_name'), r->>'lessons_completed_raw',
         p_snapshot_date, 'settings-upload'
  FROM jsonb_array_elements(p_rows) r
  WHERE nullif(btrim(r->>'teacher_name'), '') IS NOT NULL
  ON CONFLICT (teacher_name_raw, course_url, snapshot_date) DO UPDATE SET
    course_name_raw = EXCLUDED.course_name_raw, lessons_completed_raw = EXCLUDED.lessons_completed_raw;

  DELETE FROM fact.lms_completions WHERE snapshot_date = p_snapshot_date;

  INSERT INTO fact.lms_completions (person_id, teacher_name_raw, course_name_raw, grade, is_music_library,
         course_title, lessons_completed, lessons_total, completion_pct, course_url, snapshot_date)
  SELECT
    psm.person_id,
    btrim(r->>'teacher_name'),
    r->>'course_name',
    nullif(substring(r->>'course_name' FROM 'Grade\s*(\d+)'), ''),
    (r->>'course_name') ILIKE '%music library%',
    r->>'course_name',
    split_part(r->>'lessons_completed_raw', '/', 1)::int,
    nullif(split_part(r->>'lessons_completed_raw', '/', 2), '')::int,
    CASE WHEN nullif(split_part(r->>'lessons_completed_raw','/',2),'')::int > 0
         THEN round(100.0 * split_part(r->>'lessons_completed_raw','/',1)::int
                    / split_part(r->>'lessons_completed_raw','/',2)::int, 1)
         ELSE 0 END,
    r->>'course_url',
    p_snapshot_date
  FROM jsonb_array_elements(p_rows) r
  LEFT JOIN identity.person_source_map psm
    ON psm.source_system = 'lms' AND lower(btrim(psm.raw_identifier)) = lower(btrim(r->>'teacher_name'))
  WHERE nullif(btrim(r->>'teacher_name'), '') IS NOT NULL
    AND (r->>'lessons_completed_raw') ~ '^\s*\d+\s*/\s*\d+\s*$';
  GET DIAGNOSTICS n = ROW_COUNT;

  -- Queue any teacher name we couldn't resolve, for Match Review.
  INSERT INTO identity.match_review_queue (source_system, raw_identifier, status)
  SELECT DISTINCT 'lms', btrim(r->>'teacher_name'), 'pending'
  FROM jsonb_array_elements(p_rows) r
  WHERE nullif(btrim(r->>'teacher_name'), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM identity.person_source_map psm
      WHERE psm.source_system = 'lms' AND lower(btrim(psm.raw_identifier)) = lower(btrim(r->>'teacher_name'))
    )
  ON CONFLICT (source_system, raw_identifier) DO NOTHING;

  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_ingest_lms(jsonb, date) TO authenticated;
