-- Remove leftover demo/seed data before wider rollout (go-live checklist
-- item "Remove demo data"). None of these rows have a real Supabase Auth
-- login, so nothing loses access -- the persistent test-admin@ /
-- test-schooladmin@ / test-teacher@theearacademy.com accounts are
-- untouched, since they're the logins actively used for the team's test
-- round right now.
--
-- Removed:
--   - "Brandon Test School" (id 47) and "Brandon Bobbs" (test@the-ear.com),
--     a personal dev-test school/teacher pair with no Drive Ed/Product
--     Fruits mapping, showing up as a real row on the School Report.
--   - A stray leftover teaching_assignments row for Brandon Bobbs at Sky
--     City Primary (school_id=1), predating the current catalog schema.
--   - Six "Demo Teacher — {School}" accounts (person ids 583-588), seeded
--     during earlier preview work with no login of their own, carrying 317
--     fake lesson_progress rows between them and showing up as extra fake
--     rows on the Teachers page next to the real 50+ teachers.
--
-- catalog.course_assignments and catalog.lesson_progress cascade on
-- person deletion; identity.teaching_assignments does not, so it's
-- cleared explicitly first.

DELETE FROM identity.teaching_assignments WHERE person_id = 579;

DELETE FROM identity.people WHERE id IN (583, 584, 585, 586, 587, 588); -- Demo Teacher — *
DELETE FROM identity.people WHERE id = 579; -- Brandon Bobbs

DELETE FROM identity.schools WHERE id = 47; -- Brandon Test School
