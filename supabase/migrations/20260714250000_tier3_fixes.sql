-- Tier-3 fixes from the full calculations audit: minor/edge-case issues
-- that don't visibly contradict other numbers but are still wrong.
--
-- 1. v_school_report's teacher_count/admin_count used an exact-match FILTER
--    on Product Fruits' raw role label, so a combined value like "Teacher,
--    School Administrator" (which real PF exports can produce) was silently
--    excluded from both counts even though the person correctly counts
--    toward active_user_count. Switched to a substring match.
--
-- 2. drived_latest's DISTINCT ON relied on Postgres's default DESC-sorts-
--    NULLS-FIRST behavior to keep a NULL snapshot_date from ever winning
--    "latest" -- there's no NOT NULL constraint on the column, so make this
--    explicit instead of relying on a default.
--
-- 3. v_teacher_report's grade_agg used a plain SELECT DISTINCT on raw grade
--    text, so "Grade 1" and "GRADE 1" both survived as separate values and
--    rendered as "Grade 1, GRADE 1" for one teacher. Also the sort_rank
--    regex matched the first digit run anywhere in the string, mis-sorting
--    an unusual label like "Grade R-3" as Grade 3. Both are now normalized
--    into a canonical "Grade N" / "Grade R" label before dedup/sorting.
--
-- 4. admin_ingest_drived's skipped/unmatched_schools summary only counted
--    rows whose core_id matched the numeric pattern but wasn't a known
--    school; a row with a blank or non-numeric core_id was silently
--    dropped from both the loaded and skipped counts. Now counted as
--    skipped too.
--
-- 5. admin_backfill_pf_schools joined staging.stg_product_fruits (one row
--    per person per upload) with no "most recent" tie-break, so a person
--    seen across multiple uploads under different school labels resolved
--    to an unspecified one. Also its GET DIAGNOSTICS only reported the
--    first of its two UPDATEs, silently discarding the second's count.
--    Now deterministic (latest snapshot wins) and reports both counts.

-- ---------- v_school_report: substring role match, NULLS-LAST snapshot pick ----------
CREATE OR REPLACE VIEW reporting.v_school_report AS
WITH drived_latest AS (
  SELECT DISTINCT ON (school_usage_daily.school_id) school_usage_daily.school_id,
    school_usage_daily.snapshot_date, school_usage_daily.users, school_usage_daily.invited,
    school_usage_daily.accepted, school_usage_daily.logged, school_usage_daily.studied
  FROM fact.school_usage_daily
  WHERE school_usage_daily.school_id IS NOT NULL
  ORDER BY school_usage_daily.school_id, school_usage_daily.snapshot_date DESC NULLS LAST
), product_fruits_agg AS (
  SELECT pfa.school_id,
    count(DISTINCT pfa.person_id) AS active_user_count,
    count(DISTINCT pfa.person_id) FILTER (WHERE pfa.user_role ILIKE '%teacher%') AS teacher_count,
    count(DISTINCT pfa.person_id) FILTER (WHERE pfa.user_role ILIKE '%school administrator%') AS admin_count,
    max(pfa.event_datetime) AS last_activity_at
  FROM fact.product_fruits_activity pfa
  JOIN (
    SELECT DISTINCT ON (school_id) school_id, snapshot_date
    FROM fact.product_fruits_activity
    WHERE school_id IS NOT NULL
    ORDER BY school_id, snapshot_date DESC NULLS LAST
  ) pl ON pl.school_id = pfa.school_id AND pfa.snapshot_date IS NOT DISTINCT FROM pl.snapshot_date
  WHERE pfa.school_id IS NOT NULL
  GROUP BY pfa.school_id
), catalog_progress AS (
  SELECT ca.person_id, ca.course_id, p.school_id,
    count(l.id) AS lessons_total,
    count(lp.id) AS lessons_completed
  FROM catalog.course_assignments ca
  JOIN identity.people p ON p.id = ca.person_id
  JOIN catalog.courses c ON c.id = ca.course_id AND c.is_active
  LEFT JOIN catalog.modules m ON m.course_id = ca.course_id
  LEFT JOIN catalog.lessons l ON l.module_id = m.id
  LEFT JOIN catalog.lesson_progress lp ON lp.lesson_id = l.id AND lp.person_id = ca.person_id
  WHERE p.school_id IS NOT NULL AND lower(p.role) = 'teacher'
  GROUP BY ca.person_id, ca.course_id, p.school_id
), catalog_agg AS (
  SELECT school_id,
    count(*)::bigint AS course_rows,
    sum(lessons_completed)::bigint AS total_lessons_completed,
    sum(lessons_total)::bigint AS total_lessons_assigned,
    round(100.0 * sum(lessons_completed) / nullif(sum(lessons_total), 0), 1) AS avg_completion_pct
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

-- ---------- v_teacher_report: canonical grade labels (case-insensitive dedup + tighter sort) ----------
CREATE OR REPLACE VIEW reporting.v_teacher_report AS
WITH per_course AS (
  SELECT ca.person_id, ca.course_id,
    count(l.id) AS lessons_total,
    count(lp.id) AS lessons_completed
  FROM catalog.course_assignments ca
  JOIN catalog.courses c ON c.id = ca.course_id AND c.is_active
  LEFT JOIN catalog.modules m ON m.course_id = ca.course_id
  LEFT JOIN catalog.lessons l ON l.module_id = m.id
  LEFT JOIN catalog.lesson_progress lp ON lp.lesson_id = l.id AND lp.person_id = ca.person_id
  GROUP BY ca.person_id, ca.course_id
), catalog_progress AS (
  SELECT person_id,
    count(*)::bigint AS course_rows,
    sum(lessons_completed)::bigint AS total_lessons_completed,
    sum(lessons_total)::bigint AS total_lessons_assigned,
    round(100.0 * sum(lessons_completed) / nullif(sum(lessons_total), 0), 1) AS avg_completion_pct
  FROM per_course
  GROUP BY person_id
), login_agg AS (
  SELECT tu.person_id,
    count(le.id) AS login_count,
    max(le.created_at) AS last_login_at
  FROM identity.teacher_users tu
  LEFT JOIN identity.login_events le ON le.auth_user_id = tu.auth_user_id
  GROUP BY tu.person_id
), grade_parsed AS (
  -- Collapse case variants ("Grade 1" / "GRADE 1") onto one canonical label
  -- before dedup, and only treat a clean "Grade <digits>" / "Grade R" shape
  -- as a sortable grade -- anything else (e.g. "Grade R-3") keeps its own
  -- text and sorts last, instead of a loose digit-anywhere regex silently
  -- mis-ranking it.
  SELECT DISTINCT ca.person_id,
    CASE
      WHEN upper(btrim(c.grade)) IN ('GRADE R', 'R') THEN 0
      WHEN btrim(c.grade) ~* '^grade\s*\d+$' THEN substring(btrim(c.grade) FROM '(\d+)$')::int
      ELSE 99
    END AS sort_rank,
    CASE
      WHEN upper(btrim(c.grade)) IN ('GRADE R', 'R') THEN 'Grade R'
      WHEN btrim(c.grade) ~* '^grade\s*\d+$' THEN 'Grade ' || substring(btrim(c.grade) FROM '(\d+)$')
      ELSE btrim(c.grade)
    END AS grade_label
  FROM catalog.course_assignments ca
  JOIN catalog.courses c ON c.id = ca.course_id
  WHERE c.grade IS NOT NULL
), grade_agg AS (
  SELECT person_id, string_agg(grade_label, ', ' ORDER BY sort_rank, grade_label) AS grades
  FROM grade_parsed
  GROUP BY person_id
)
SELECT p.id AS person_id, p.canonical_full_name AS teacher_name, p.primary_email, p.school_id, s.school_name,
  ga.grades,
  coalesce(cp.course_rows, 0) AS course_rows,
  coalesce(cp.total_lessons_completed, 0) AS total_lessons_completed,
  coalesce(cp.total_lessons_assigned, 0) AS total_lessons_assigned,
  cp.avg_completion_pct,
  coalesce(la.login_count, 0) AS login_count,
  la.last_login_at,
  max(pfa.event_datetime) AS last_product_fruits_activity
FROM identity.people p
  LEFT JOIN identity.schools s ON s.id = p.school_id
  LEFT JOIN catalog_progress cp ON cp.person_id = p.id
  LEFT JOIN login_agg la ON la.person_id = p.id
  LEFT JOIN grade_agg ga ON ga.person_id = p.id
  LEFT JOIN fact.product_fruits_activity pfa ON pfa.person_id = p.id
WHERE lower(p.role) = 'teacher'::text
GROUP BY p.id, p.canonical_full_name, p.primary_email, p.school_id, s.school_name,
  ga.grades, cp.course_rows, cp.total_lessons_completed, cp.total_lessons_assigned, cp.avg_completion_pct,
  la.login_count, la.last_login_at
ORDER BY s.school_name, p.canonical_full_name;

-- ---------- admin_ingest_drived: count regex-rejected rows as skipped too ----------
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

  -- Skipped = every row that didn't end up loaded: a bad/blank core_id, or
  -- a valid-looking core_id that isn't one of our schools. Previously only
  -- the second case was counted, so a malformed row vanished silently.
  SELECT count(*), coalesce(jsonb_agg(DISTINCT label), '[]'::jsonb)
    INTO v_skipped, v_unmatched
  FROM (
    SELECT coalesce(nullif(btrim(r->>'name'), ''), 'core_id ' || coalesce(r->>'core_id', '(blank)')) AS label
    FROM jsonb_array_elements(p_rows) r
    WHERE NOT (
      (r->>'core_id') ~ '^\d+$'
      AND EXISTS (SELECT 1 FROM identity.schools s WHERE s.drived_core_id = (r->>'core_id')::int)
    )
  ) q;

  RETURN jsonb_build_object('loaded', n, 'skipped', v_skipped, 'unmatched_schools', v_unmatched);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_ingest_drived(jsonb, date) TO authenticated;

-- ---------- admin_backfill_pf_schools: deterministic latest-snapshot pick, both counts reported ----------
-- Return type changes (integer -> jsonb), so the old function must be dropped first.
DROP FUNCTION IF EXISTS public.admin_backfill_pf_schools();
CREATE FUNCTION public.admin_backfill_pf_schools()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n_activity integer; n_people integer;
BEGIN
  IF NOT identity.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING errcode = '42501';
  END IF;

  -- One row per person: their most recent Product Fruits snapshot's school,
  -- so a person seen across multiple uploads (possibly under a changed
  -- school label) resolves to a single, deterministic school instead of an
  -- unspecified match from an UPDATE...FROM with multiple candidate rows.
  WITH pf AS (
    SELECT DISTINCT ON (psm.person_id) psm.person_id, sch.id AS school_id
    FROM identity.person_source_map psm
    JOIN staging.stg_product_fruits sp
      ON lower(btrim(sp.email_address)) = lower(btrim(psm.raw_identifier))
    JOIN identity.schools sch
      ON lower(btrim(sch.product_fruits_school_name)) = lower(btrim(sp.school_name))
    WHERE psm.source_system = 'product_fruits'
    ORDER BY psm.person_id, sp.snapshot_date DESC NULLS LAST
  )
  UPDATE fact.product_fruits_activity a
  SET school_id = pf.school_id
  FROM pf
  WHERE a.person_id = pf.person_id AND a.school_id IS NULL;
  GET DIAGNOSTICS n_activity = ROW_COUNT;

  WITH pf AS (
    SELECT DISTINCT ON (psm.person_id) psm.person_id, sch.id AS school_id
    FROM identity.person_source_map psm
    JOIN staging.stg_product_fruits sp
      ON lower(btrim(sp.email_address)) = lower(btrim(psm.raw_identifier))
    JOIN identity.schools sch
      ON lower(btrim(sch.product_fruits_school_name)) = lower(btrim(sp.school_name))
    WHERE psm.source_system = 'product_fruits'
    ORDER BY psm.person_id, sp.snapshot_date DESC NULLS LAST
  )
  UPDATE identity.people p
  SET school_id = pf.school_id
  FROM pf
  WHERE p.id = pf.person_id AND p.school_id IS NULL;
  GET DIAGNOSTICS n_people = ROW_COUNT;

  RETURN jsonb_build_object('activity_rows', n_activity, 'people_rows', n_people);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_backfill_pf_schools() TO authenticated;
