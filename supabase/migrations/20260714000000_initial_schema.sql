-- Core Group Dashboard - Supabase schema export
-- Exported via Supabase Management API on 2026-07-14
-- Project ref: uvxpngmnczixgkzhvaly

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- SCHEMA: identity
-- ============================================================
CREATE SCHEMA IF NOT EXISTS identity;

-- ============================================================
-- SCHEMA: staging
-- ============================================================
CREATE SCHEMA IF NOT EXISTS staging;

-- ============================================================
-- SCHEMA: fact
-- ============================================================
CREATE SCHEMA IF NOT EXISTS fact;

-- ============================================================
-- SCHEMA: reporting
-- ============================================================
CREATE SCHEMA IF NOT EXISTS reporting;

-- Table: fact.lms_completions
CREATE TABLE fact.lms_completions (
  "id" bigint NOT NULL,
  "person_id" bigint,
  "teacher_name_raw" text NOT NULL,
  "course_name_raw" text,
  "grade" text,
  "is_music_library" boolean,
  "course_title" text,
  "lessons_completed" integer,
  "lessons_total" integer,
  "completion_pct" numeric,
  "course_url" text,
  "loaded_at" timestamptz NOT NULL DEFAULT now(),
  "snapshot_date" date,
  CONSTRAINT "lms_completions_person_id_fkey" FOREIGN KEY (person_id) REFERENCES identity.people(id),
  CONSTRAINT "lms_completions_pkey" PRIMARY KEY (id)
);

CREATE INDEX idx_lms_completions_person_id ON fact.lms_completions USING btree (person_id);

ALTER TABLE fact.lms_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_scoped_read" ON fact.lms_completions AS PERMISSIVE FOR SELECT TO public
  USING ((identity.is_super_admin() OR (person_id IN ( SELECT people.id
   FROM identity.people
  WHERE (people.school_id IN ( SELECT identity.my_school_ids() AS my_school_ids))))));

CREATE POLICY "teacher_own_completions" ON fact.lms_completions AS PERMISSIVE FOR SELECT TO public
  USING ((person_id = identity.my_person_id()));

-- Table: fact.product_fruits_activity
CREATE TABLE fact.product_fruits_activity (
  "id" bigint NOT NULL,
  "person_id" bigint,
  "school_id" bigint,
  "event_datetime" timestamptz,
  "user_role" text,
  "product_type" text,
  "billing_status" text,
  CONSTRAINT "product_fruits_activity_person_id_fkey" FOREIGN KEY (person_id) REFERENCES identity.people(id),
  CONSTRAINT "product_fruits_activity_pkey" PRIMARY KEY (id),
  CONSTRAINT "product_fruits_activity_school_id_fkey" FOREIGN KEY (school_id) REFERENCES identity.schools(id)
);

CREATE INDEX idx_product_fruits_activity_person_id ON fact.product_fruits_activity USING btree (person_id);

ALTER TABLE fact.product_fruits_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_scoped_read" ON fact.product_fruits_activity AS PERMISSIVE FOR SELECT TO public
  USING ((identity.is_super_admin() OR (school_id IN ( SELECT identity.my_school_ids() AS my_school_ids))));

CREATE POLICY "teacher_own_activity" ON fact.product_fruits_activity AS PERMISSIVE FOR SELECT TO public
  USING ((person_id = identity.my_person_id()));

-- Table: fact.school_usage_daily
CREATE TABLE fact.school_usage_daily (
  "id" bigint NOT NULL,
  "school_id" bigint,
  "drived_core_id" integer,
  "snapshot_date" date,
  "users" integer,
  "invited" integer,
  "accepted" integer,
  "logged" integer,
  "studied" integer,
  CONSTRAINT "school_usage_daily_pkey" PRIMARY KEY (id),
  CONSTRAINT "school_usage_daily_school_id_fkey" FOREIGN KEY (school_id) REFERENCES identity.schools(id)
);

CREATE INDEX idx_school_usage_daily_school_id ON fact.school_usage_daily USING btree (school_id);

ALTER TABLE fact.school_usage_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_scoped_read" ON fact.school_usage_daily AS PERMISSIVE FOR SELECT TO public
  USING ((identity.is_super_admin() OR (school_id IN ( SELECT identity.my_school_ids() AS my_school_ids))));

-- Table: fact.school_video_engagement
CREATE TABLE fact.school_video_engagement (
  "id" bigint NOT NULL,
  "school_id" bigint NOT NULL,
  "source_url" text,
  "views" integer,
  "impressions" integer,
  "unique_impressions" integer,
  "unique_viewers" integer,
  "total_time_watched_seconds" integer,
  "avg_time_watched_seconds" integer,
  "avg_pct_watched" numeric,
  "finishes" integer,
  "downloads" integer,
  "snapshot_date" date,
  CONSTRAINT "school_video_engagement_pkey" PRIMARY KEY (id),
  CONSTRAINT "school_video_engagement_school_id_fkey" FOREIGN KEY (school_id) REFERENCES identity.schools(id)
);

CREATE INDEX idx_school_video_engagement_school_id ON fact.school_video_engagement USING btree (school_id);

ALTER TABLE fact.school_video_engagement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_scoped_read" ON fact.school_video_engagement AS PERMISSIVE FOR SELECT TO public
  USING ((identity.is_super_admin() OR (school_id IN ( SELECT identity.my_school_ids() AS my_school_ids))));

-- Table: identity.match_review_queue
CREATE TABLE identity.match_review_queue (
  "id" bigint NOT NULL,
  "source_system" text NOT NULL,
  "raw_identifier" text NOT NULL,
  "candidate_person_id" bigint,
  "similarity_score" numeric,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "reviewed_by" text,
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "match_review_queue_candidate_person_id_fkey" FOREIGN KEY (candidate_person_id) REFERENCES identity.people(id),
  CONSTRAINT "match_review_queue_pkey" PRIMARY KEY (id),
  CONSTRAINT "uq_match_review_queue_source_raw" UNIQUE (source_system, raw_identifier)
);

CREATE INDEX idx_match_review_queue_status ON identity.match_review_queue USING btree (status);

ALTER TABLE identity.match_review_queue ENABLE ROW LEVEL SECURITY;

-- Table: identity.people
CREATE TABLE identity.people (
  "id" bigint NOT NULL,
  "school_id" bigint,
  "first_name" text,
  "surname" text,
  "canonical_full_name" text,
  "primary_email" text,
  "role" text,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "people_pkey" PRIMARY KEY (id),
  CONSTRAINT "people_school_id_fkey" FOREIGN KEY (school_id) REFERENCES identity.schools(id)
);

CREATE INDEX idx_people_name_trgm ON identity.people USING gin (canonical_full_name gin_trgm_ops);
CREATE INDEX idx_people_school_id ON identity.people USING btree (school_id);
CREATE UNIQUE INDEX uq_people_email ON identity.people USING btree (lower(TRIM(BOTH FROM primary_email))) WHERE (primary_email IS NOT NULL);
CREATE UNIQUE INDEX uq_people_primary_email_norm ON identity.people USING btree (lower(TRIM(BOTH FROM primary_email))) WHERE ((primary_email IS NOT NULL) AND (TRIM(BOTH FROM primary_email) <> ''::text));

ALTER TABLE identity.people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_scoped_read" ON identity.people AS PERMISSIVE FOR SELECT TO public
  USING ((identity.is_super_admin() OR (school_id IN ( SELECT identity.my_school_ids() AS my_school_ids))));

CREATE POLICY "super_admin_update_people" ON identity.people AS PERMISSIVE FOR UPDATE TO public
  USING (identity.is_super_admin());

CREATE POLICY "super_admin_write_people" ON identity.people AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (identity.is_super_admin());

CREATE POLICY "teacher_own_row" ON identity.people AS PERMISSIVE FOR SELECT TO public
  USING ((id = identity.my_person_id()));

-- Table: identity.person_source_map
CREATE TABLE identity.person_source_map (
  "id" bigint NOT NULL,
  "person_id" bigint NOT NULL,
  "source_system" text NOT NULL,
  "raw_identifier" text NOT NULL,
  "match_method" text NOT NULL,
  "match_confidence" numeric,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "person_source_map_person_id_fkey" FOREIGN KEY (person_id) REFERENCES identity.people(id),
  CONSTRAINT "person_source_map_pkey" PRIMARY KEY (id),
  CONSTRAINT "person_source_map_source_system_raw_identifier_key" UNIQUE (source_system, raw_identifier)
);

CREATE INDEX idx_person_source_map_person_id ON identity.person_source_map USING btree (person_id);

ALTER TABLE identity.person_source_map ENABLE ROW LEVEL SECURITY;

-- Table: identity.school_admin_users
CREATE TABLE identity.school_admin_users (
  "id" bigint NOT NULL,
  "auth_user_id" uuid NOT NULL,
  "school_id" bigint NOT NULL,
  "email" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "school_admin_users_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "school_admin_users_auth_user_id_school_id_key" UNIQUE (auth_user_id, school_id),
  CONSTRAINT "school_admin_users_pkey" PRIMARY KEY (id),
  CONSTRAINT "school_admin_users_school_id_fkey" FOREIGN KEY (school_id) REFERENCES identity.schools(id)
);

CREATE INDEX idx_school_admin_users_auth_user ON identity.school_admin_users USING btree (auth_user_id);

ALTER TABLE identity.school_admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_rows_only" ON identity.school_admin_users AS PERMISSIVE FOR SELECT TO public
  USING ((auth_user_id = auth.uid()));

-- Table: identity.schools
CREATE TABLE identity.schools (
  "id" bigint NOT NULL,
  "school_name" text NOT NULL,
  "drived_core_id" integer,
  "drived_name" text,
  "vimeo_source_url" text,
  "product_fruits_school_name" text,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "schools_drived_core_id_key" UNIQUE (drived_core_id),
  CONSTRAINT "schools_pkey" PRIMARY KEY (id)
);


ALTER TABLE identity.schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_scoped_read" ON identity.schools AS PERMISSIVE FOR SELECT TO public
  USING ((identity.is_super_admin() OR (id IN ( SELECT identity.my_school_ids() AS my_school_ids))));

CREATE POLICY "super_admin_write_schools" ON identity.schools AS PERMISSIVE FOR ALL TO public
  USING (identity.is_super_admin())
  WITH CHECK (identity.is_super_admin());

-- Table: identity.super_admin_users
CREATE TABLE identity.super_admin_users (
  "id" bigint NOT NULL,
  "auth_user_id" uuid NOT NULL,
  "email" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "super_admin_users_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "super_admin_users_auth_user_id_key" UNIQUE (auth_user_id),
  CONSTRAINT "super_admin_users_pkey" PRIMARY KEY (id)
);


ALTER TABLE identity.super_admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_row_only" ON identity.super_admin_users AS PERMISSIVE FOR SELECT TO public
  USING ((auth_user_id = auth.uid()));

-- Table: identity.teacher_users
CREATE TABLE identity.teacher_users (
  "id" bigint NOT NULL,
  "auth_user_id" uuid NOT NULL,
  "person_id" bigint NOT NULL,
  "email" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "teacher_users_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "teacher_users_auth_user_id_key" UNIQUE (auth_user_id),
  CONSTRAINT "teacher_users_person_id_fkey" FOREIGN KEY (person_id) REFERENCES identity.people(id),
  CONSTRAINT "teacher_users_person_id_key" UNIQUE (person_id),
  CONSTRAINT "teacher_users_pkey" PRIMARY KEY (id)
);


ALTER TABLE identity.teacher_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_row_only" ON identity.teacher_users AS PERMISSIVE FOR SELECT TO public
  USING ((auth_user_id = auth.uid()));

-- Table: identity.teaching_assignments
CREATE TABLE identity.teaching_assignments (
  "id" bigint NOT NULL,
  "person_id" bigint NOT NULL,
  "school_id" bigint NOT NULL,
  "grade" text NOT NULL,
  "course_title" text NOT NULL,
  "assigned_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "teaching_assignments_person_id_fkey" FOREIGN KEY (person_id) REFERENCES identity.people(id),
  CONSTRAINT "teaching_assignments_person_id_school_id_grade_course_title_key" UNIQUE (person_id, school_id, grade, course_title),
  CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY (id),
  CONSTRAINT "teaching_assignments_school_id_fkey" FOREIGN KEY (school_id) REFERENCES identity.schools(id)
);


ALTER TABLE identity.teaching_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_delete_assignments" ON identity.teaching_assignments AS PERMISSIVE FOR DELETE TO public
  USING (identity.is_super_admin());

CREATE POLICY "super_admin_manage_assignments" ON identity.teaching_assignments AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (identity.is_super_admin());

CREATE POLICY "super_admin_update_assignments" ON identity.teaching_assignments AS PERMISSIVE FOR UPDATE TO public
  USING (identity.is_super_admin());

CREATE POLICY "teacher_own_assignments" ON identity.teaching_assignments AS PERMISSIVE FOR SELECT TO public
  USING ((identity.is_super_admin() OR (school_id IN ( SELECT identity.my_school_ids() AS my_school_ids)) OR (person_id = identity.my_person_id())));

-- Table: staging.stg_drived
CREATE TABLE staging.stg_drived (
  "id" bigint NOT NULL,
  "core_id" integer NOT NULL,
  "name" text,
  "snapshot_date" date,
  "users" integer,
  "invited" integer,
  "accepted" integer,
  "logged" integer,
  "studied" integer,
  "source_file" text,
  "loaded_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "stg_drived_pkey" PRIMARY KEY (id),
  CONSTRAINT "uq_stg_drived_core_id_date" UNIQUE (core_id, snapshot_date)
);

CREATE INDEX idx_stg_drived_core_id ON staging.stg_drived USING btree (core_id);
CREATE INDEX idx_stg_drived_snapshot_date ON staging.stg_drived USING btree (snapshot_date);

ALTER TABLE staging.stg_drived ENABLE ROW LEVEL SECURITY;

-- Table: staging.stg_lms
CREATE TABLE staging.stg_lms (
  "id" bigint NOT NULL,
  "course_name_raw" text,
  "course_url" text,
  "course_image" text,
  "teacher_name_raw" text,
  "lessons_completed_raw" text,
  "source_file" text,
  "loaded_at" timestamptz NOT NULL DEFAULT now(),
  "snapshot_date" date NOT NULL DEFAULT CURRENT_DATE,
  CONSTRAINT "stg_lms_pkey" PRIMARY KEY (id),
  CONSTRAINT "uq_stg_lms_teacher_course_date" UNIQUE (teacher_name_raw, course_url, snapshot_date)
);

CREATE INDEX idx_stg_lms_teacher_name_raw ON staging.stg_lms USING btree (teacher_name_raw);

ALTER TABLE staging.stg_lms ENABLE ROW LEVEL SECURITY;

-- Table: staging.stg_product_fruits
CREATE TABLE staging.stg_product_fruits (
  "id" bigint NOT NULL,
  "username" text,
  "email_address" text,
  "first_name" text,
  "surname" text,
  "full_name_raw" text,
  "event_datetime_raw" text,
  "user_role" text,
  "school_name" text,
  "product_type" text,
  "billing_status" text,
  "source_file" text,
  "loaded_at" timestamptz NOT NULL DEFAULT now(),
  "snapshot_date" date NOT NULL DEFAULT CURRENT_DATE,
  CONSTRAINT "stg_product_fruits_pkey" PRIMARY KEY (id),
  CONSTRAINT "uq_stg_product_fruits_email_date" UNIQUE (email_address, snapshot_date)
);

CREATE INDEX idx_stg_product_fruits_email ON staging.stg_product_fruits USING btree (lower(TRIM(BOTH FROM email_address)));

ALTER TABLE staging.stg_product_fruits ENABLE ROW LEVEL SECURITY;

-- Table: staging.stg_vimeo
CREATE TABLE staging.stg_vimeo (
  "id" bigint NOT NULL,
  "source_url" text,
  "views" integer,
  "impressions" integer,
  "unique_impressions" integer,
  "unique_viewers" integer,
  "total_time_watched_seconds" integer,
  "avg_time_watched_seconds" integer,
  "avg_pct_watched" numeric,
  "finishes" integer,
  "downloads" integer,
  "source_file" text,
  "loaded_at" timestamptz NOT NULL DEFAULT now(),
  "snapshot_date" date NOT NULL DEFAULT CURRENT_DATE,
  CONSTRAINT "stg_vimeo_pkey" PRIMARY KEY (id),
  CONSTRAINT "uq_stg_vimeo_url_date" UNIQUE (source_url, snapshot_date)
);

CREATE INDEX idx_stg_vimeo_source_url ON staging.stg_vimeo USING btree (source_url);

ALTER TABLE staging.stg_vimeo ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION identity.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select exists (
        select 1 from identity.super_admin_users where auth_user_id = auth.uid()
    );
$function$


CREATE OR REPLACE FUNCTION identity.my_person_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select person_id from identity.teacher_users where auth_user_id = auth.uid();
$function$


CREATE OR REPLACE FUNCTION identity.my_school_ids()
 RETURNS SETOF bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select school_id from identity.school_admin_users where auth_user_id = auth.uid();
$function$


-- ============================================================
-- VIEWS
-- ============================================================
CREATE OR REPLACE VIEW reporting.v_school_report AS
 WITH drived_latest AS (
         SELECT DISTINCT ON (school_usage_daily.school_id) school_usage_daily.school_id,
            school_usage_daily.snapshot_date,
            school_usage_daily.users,
            school_usage_daily.invited,
            school_usage_daily.accepted,
            school_usage_daily.logged,
            school_usage_daily.studied
           FROM fact.school_usage_daily
          WHERE (school_usage_daily.school_id IS NOT NULL)
          ORDER BY school_usage_daily.school_id, school_usage_daily.snapshot_date DESC
        ), vimeo_latest AS (
         SELECT DISTINCT ON (school_video_engagement.school_id) school_video_engagement.school_id,
            school_video_engagement.snapshot_date,
            school_video_engagement.views,
            school_video_engagement.impressions,
            school_video_engagement.unique_viewers,
            school_video_engagement.finishes,
            school_video_engagement.avg_pct_watched
           FROM fact.school_video_engagement
          ORDER BY school_video_engagement.school_id, school_video_engagement.snapshot_date DESC
        ), product_fruits_agg AS (
         SELECT product_fruits_activity.school_id,
            count(DISTINCT product_fruits_activity.person_id) AS active_user_count,
            count(DISTINCT product_fruits_activity.person_id) FILTER (WHERE (lower(product_fruits_activity.user_role) = 'teacher'::text)) AS teacher_count,
            count(DISTINCT product_fruits_activity.person_id) FILTER (WHERE (lower(product_fruits_activity.user_role) = 'school administrator'::text)) AS admin_count,
            max(product_fruits_activity.event_datetime) AS last_activity_at
           FROM fact.product_fruits_activity
          WHERE (product_fruits_activity.school_id IS NOT NULL)
          GROUP BY product_fruits_activity.school_id
        ), lms_latest AS (
         SELECT DISTINCT ON (lms_completions.person_id, lms_completions.course_url) lms_completions.person_id,
            lms_completions.course_url,
            lms_completions.snapshot_date,
            lms_completions.lessons_completed,
            lms_completions.lessons_total,
            lms_completions.completion_pct
           FROM fact.lms_completions
          WHERE (lms_completions.person_id IS NOT NULL)
          ORDER BY lms_completions.person_id, lms_completions.course_url, lms_completions.snapshot_date DESC
        ), lms_agg AS (
         SELECT p.school_id,
            count(*) AS course_rows,
            sum(ll.lessons_completed) AS total_lessons_completed,
            sum(ll.lessons_total) AS total_lessons_assigned,
            round(avg(ll.completion_pct), 1) AS avg_completion_pct
           FROM (lms_latest ll
             JOIN identity.people p ON ((p.id = ll.person_id)))
          WHERE (p.school_id IS NOT NULL)
          GROUP BY p.school_id
        )
 SELECT s.id AS school_id,
    s.school_name,
    s.drived_core_id,
    dl.snapshot_date AS drived_latest_snapshot_date,
    dl.users AS drived_users,
    dl.invited AS drived_invited,
    dl.accepted AS drived_accepted,
    dl.logged AS drived_logged,
    dl.studied AS drived_studied,
    vl.snapshot_date AS vimeo_latest_snapshot_date,
    vl.views AS vimeo_views,
    vl.impressions AS vimeo_impressions,
    vl.unique_viewers AS vimeo_unique_viewers,
    vl.finishes AS vimeo_finishes,
    vl.avg_pct_watched AS vimeo_avg_pct_watched,
    pfa.active_user_count AS product_fruits_active_users,
    pfa.teacher_count AS product_fruits_teachers,
    pfa.admin_count AS product_fruits_admins,
    pfa.last_activity_at AS product_fruits_last_activity,
    la.course_rows AS lms_course_rows,
    la.total_lessons_completed,
    la.total_lessons_assigned,
    la.avg_completion_pct AS lms_avg_completion_pct
   FROM ((((identity.schools s
     LEFT JOIN drived_latest dl ON ((dl.school_id = s.id)))
     LEFT JOIN vimeo_latest vl ON ((vl.school_id = s.id)))
     LEFT JOIN product_fruits_agg pfa ON ((pfa.school_id = s.id)))
     LEFT JOIN lms_agg la ON ((la.school_id = s.id)))
  ORDER BY s.school_name;

CREATE OR REPLACE VIEW reporting.v_school_trend AS
 WITH drived_series AS (
         SELECT school_usage_daily.school_id,
            school_usage_daily.snapshot_date,
            school_usage_daily.users,
            school_usage_daily.invited,
            school_usage_daily.accepted,
            school_usage_daily.logged,
            school_usage_daily.studied
           FROM fact.school_usage_daily
          WHERE (school_usage_daily.school_id IS NOT NULL)
        ), vimeo_series AS (
         SELECT school_video_engagement.school_id,
            school_video_engagement.snapshot_date,
            school_video_engagement.views,
            school_video_engagement.impressions,
            school_video_engagement.unique_viewers,
            school_video_engagement.finishes,
            school_video_engagement.avg_pct_watched
           FROM fact.school_video_engagement
        ), lms_series AS (
         SELECT p.school_id,
            lc.snapshot_date,
            sum(lc.lessons_completed) AS total_lessons_completed,
            sum(lc.lessons_total) AS total_lessons_assigned,
            round(avg(lc.completion_pct), 1) AS avg_completion_pct
           FROM (fact.lms_completions lc
             JOIN identity.people p ON ((p.id = lc.person_id)))
          WHERE (p.school_id IS NOT NULL)
          GROUP BY p.school_id, lc.snapshot_date
        ), all_dates AS (
         SELECT drived_series.school_id,
            drived_series.snapshot_date
           FROM drived_series
        UNION
         SELECT vimeo_series.school_id,
            vimeo_series.snapshot_date
           FROM vimeo_series
        UNION
         SELECT lms_series.school_id,
            lms_series.snapshot_date
           FROM lms_series
        )
 SELECT s.id AS school_id,
    s.school_name,
    d.snapshot_date,
    dr.users AS drived_users,
    dr.invited AS drived_invited,
    dr.accepted AS drived_accepted,
    dr.logged AS drived_logged,
    dr.studied AS drived_studied,
    vi.views AS vimeo_views,
    vi.impressions AS vimeo_impressions,
    vi.unique_viewers AS vimeo_unique_viewers,
    vi.finishes AS vimeo_finishes,
    vi.avg_pct_watched AS vimeo_avg_pct_watched,
    lm.total_lessons_completed,
    lm.total_lessons_assigned,
    lm.avg_completion_pct AS lms_avg_completion_pct
   FROM ((((all_dates d
     JOIN identity.schools s ON ((s.id = d.school_id)))
     LEFT JOIN drived_series dr ON (((dr.school_id = d.school_id) AND (dr.snapshot_date = d.snapshot_date))))
     LEFT JOIN vimeo_series vi ON (((vi.school_id = d.school_id) AND (vi.snapshot_date = d.snapshot_date))))
     LEFT JOIN lms_series lm ON (((lm.school_id = d.school_id) AND (lm.snapshot_date = d.snapshot_date))))
  ORDER BY s.school_name, d.snapshot_date;

CREATE OR REPLACE VIEW reporting.v_teacher_report AS
 SELECT p.id AS person_id,
    p.canonical_full_name AS teacher_name,
    p.primary_email,
    p.school_id,
    s.school_name,
    count(lc.id) AS course_rows,
    sum(lc.lessons_completed) AS total_lessons_completed,
    sum(lc.lessons_total) AS total_lessons_assigned,
    round(avg(lc.completion_pct), 1) AS avg_completion_pct,
    max(pfa.event_datetime) AS last_product_fruits_activity
   FROM (((identity.people p
     LEFT JOIN identity.schools s ON ((s.id = p.school_id)))
     LEFT JOIN fact.lms_completions lc ON ((lc.person_id = p.id)))
     LEFT JOIN fact.product_fruits_activity pfa ON ((pfa.person_id = p.id)))
  WHERE (lower(p.role) = 'teacher'::text)
  GROUP BY p.id, p.canonical_full_name, p.primary_email, p.school_id, s.school_name
  ORDER BY s.school_name, p.canonical_full_name;

-- ============================================================
-- PROJECT-LEVEL SAFEGUARDS
-- ============================================================
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE EVENT TRIGGER ensure_rls ON ddl_command_end EXECUTE FUNCTION public.rls_auto_enable();
