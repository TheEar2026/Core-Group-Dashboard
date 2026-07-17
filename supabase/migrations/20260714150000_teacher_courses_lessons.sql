-- Teacher self-service: a course/lesson catalogue that teachers tick off.
--
-- Model (all in a new `catalog` schema, reached only through public RPCs; the
-- schema is not exposed to PostgREST):
--   catalog.courses            content the super-admin defines (grade + title)
--   catalog.lessons            ordered lessons within a course
--   catalog.course_assignments which teacher (person) is assigned which course
--   catalog.lesson_progress    a teacher's ticked lessons (presence = completed)
--
-- Progress for a teacher = ticked lessons / total lessons in the course. The
-- super-admin populates courses + lessons later; this just builds the structure.

CREATE SCHEMA IF NOT EXISTS catalog;

CREATE TABLE catalog.courses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grade text,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog.lessons (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id bigint NOT NULL REFERENCES catalog.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lessons_course ON catalog.lessons(course_id);

CREATE TABLE catalog.course_assignments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  person_id bigint NOT NULL REFERENCES identity.people(id) ON DELETE CASCADE,
  course_id bigint NOT NULL REFERENCES catalog.courses(id) ON DELETE CASCADE,
  assigned_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, course_id)
);
CREATE INDEX idx_course_assignments_person ON catalog.course_assignments(person_id);

CREATE TABLE catalog.lesson_progress (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  person_id bigint NOT NULL REFERENCES identity.people(id) ON DELETE CASCADE,
  lesson_id bigint NOT NULL REFERENCES catalog.lessons(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, lesson_id)
);
CREATE INDEX idx_lesson_progress_person ON catalog.lesson_progress(person_id);

-- Defence in depth: deny direct access. All reads/writes go through the
-- SECURITY DEFINER RPCs below (whose owner bypasses RLS).
ALTER TABLE catalog.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.course_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.lesson_progress ENABLE ROW LEVEL SECURITY;

-- ============ Teacher-facing RPCs (operate on the caller's own person) ============

-- My assigned courses, with my completion progress.
CREATE OR REPLACE FUNCTION public.get_my_courses()
RETURNS TABLE(course_id bigint, grade text, title text, lessons_total int, lessons_completed int, completion_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH me AS (SELECT identity.my_person_id() AS pid)
  SELECT c.id, c.grade, c.title,
    count(l.id)::int AS lessons_total,
    count(lp.id)::int AS lessons_completed,
    CASE WHEN count(l.id) > 0
         THEN round(100.0 * count(lp.id) / count(l.id), 0)
         ELSE 0 END AS completion_pct
  FROM me
  JOIN catalog.course_assignments ca ON ca.person_id = me.pid
  JOIN catalog.courses c ON c.id = ca.course_id AND c.is_active
  LEFT JOIN catalog.lessons l ON l.course_id = c.id
  LEFT JOIN catalog.lesson_progress lp ON lp.lesson_id = l.id AND lp.person_id = me.pid
  WHERE me.pid IS NOT NULL
  GROUP BY c.id, c.grade, c.title, c.sort_order
  ORDER BY c.sort_order, c.title;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_courses() TO authenticated;

-- Lessons in one course, with my completion flag. Visible to the assigned
-- teacher, or to super-admin / school-admin for oversight.
CREATE OR REPLACE FUNCTION public.get_course_lessons(p_course_id bigint)
RETURNS TABLE(lesson_id bigint, title text, sort_order int, completed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.id, l.title, l.sort_order,
    EXISTS (
      SELECT 1 FROM catalog.lesson_progress lp
      WHERE lp.lesson_id = l.id AND lp.person_id = identity.my_person_id()
    ) AS completed
  FROM catalog.lessons l
  WHERE l.course_id = p_course_id
    AND (
      identity.is_super_admin()
      OR identity.is_school_admin()
      OR EXISTS (
        SELECT 1 FROM catalog.course_assignments ca
        WHERE ca.course_id = p_course_id AND ca.person_id = identity.my_person_id()
      )
    )
  ORDER BY l.sort_order, l.id;
$$;
GRANT EXECUTE ON FUNCTION public.get_course_lessons(bigint) TO authenticated;

-- Tick / untick one of my lessons. Only for a course I'm assigned.
CREATE OR REPLACE FUNCTION public.set_lesson_complete(p_lesson_id bigint, p_completed boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_person bigint := identity.my_person_id(); v_course bigint;
BEGIN
  IF v_person IS NULL THEN
    RAISE EXCEPTION 'No teacher profile for this account' USING errcode = '42501';
  END IF;
  SELECT course_id INTO v_course FROM catalog.lessons WHERE id = p_lesson_id;
  IF v_course IS NULL THEN
    RAISE EXCEPTION 'Unknown lesson';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM catalog.course_assignments ca
    WHERE ca.course_id = v_course AND ca.person_id = v_person
  ) THEN
    RAISE EXCEPTION 'You are not assigned this course' USING errcode = '42501';
  END IF;

  IF p_completed THEN
    INSERT INTO catalog.lesson_progress (person_id, lesson_id)
    VALUES (v_person, p_lesson_id)
    ON CONFLICT (person_id, lesson_id) DO NOTHING;
  ELSE
    DELETE FROM catalog.lesson_progress WHERE person_id = v_person AND lesson_id = p_lesson_id;
  END IF;
  RETURN p_completed;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_lesson_complete(bigint, boolean) TO authenticated;

-- ============ Super-admin authoring RPCs ============

CREATE OR REPLACE FUNCTION public.admin_list_courses()
RETURNS TABLE(course_id bigint, grade text, title text, is_active boolean, lessons_total int, assigned_teachers int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.grade, c.title, c.is_active,
    (SELECT count(*) FROM catalog.lessons l WHERE l.course_id = c.id)::int,
    (SELECT count(*) FROM catalog.course_assignments ca WHERE ca.course_id = c.id)::int
  FROM catalog.courses c
  WHERE identity.is_super_admin()
  ORDER BY c.sort_order, c.title;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_courses() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_course(p_grade text, p_title text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  IF NOT identity.is_super_admin() THEN RAISE EXCEPTION 'Not authorized' USING errcode = '42501'; END IF;
  IF nullif(btrim(p_title), '') IS NULL THEN RAISE EXCEPTION 'Course title is required'; END IF;
  INSERT INTO catalog.courses (grade, title, sort_order)
  VALUES (nullif(btrim(p_grade), ''), btrim(p_title),
          coalesce((SELECT max(sort_order) FROM catalog.courses), 0) + 1)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_create_course(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_add_lesson(p_course_id bigint, p_title text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  IF NOT identity.is_super_admin() THEN RAISE EXCEPTION 'Not authorized' USING errcode = '42501'; END IF;
  IF nullif(btrim(p_title), '') IS NULL THEN RAISE EXCEPTION 'Lesson title is required'; END IF;
  INSERT INTO catalog.lessons (course_id, title, sort_order)
  VALUES (p_course_id, btrim(p_title),
          coalesce((SELECT max(sort_order) FROM catalog.lessons WHERE course_id = p_course_id), 0) + 1)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_add_lesson(bigint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_assign_catalog_course(p_person_id bigint, p_course_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT identity.is_super_admin() THEN RAISE EXCEPTION 'Not authorized' USING errcode = '42501'; END IF;
  INSERT INTO catalog.course_assignments (person_id, course_id, assigned_by)
  VALUES (p_person_id, p_course_id, 'manage')
  ON CONFLICT (person_id, course_id) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_assign_catalog_course(bigint, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unassign_catalog_course(p_person_id bigint, p_course_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT identity.is_super_admin() THEN RAISE EXCEPTION 'Not authorized' USING errcode = '42501'; END IF;
  DELETE FROM catalog.course_assignments WHERE person_id = p_person_id AND course_id = p_course_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_unassign_catalog_course(bigint, bigint) TO authenticated;
