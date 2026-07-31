-- Remove seeded Product Fruits mock data before wider rollout.
--
-- 230 fake "PF Demo Teacher"/"PF Demo Participant" people (notes = 'PF_MOCK',
-- emails like pfdemo_<school_id>_teacher_N@mock.theearacademy.com), spread
-- across all 12 real schools, each with one fake fact.product_fruits_activity
-- row. Of the 233 total Product Fruits activity rows in the database, 230
-- (98.7%) were this seed data -- meaning "Active users", the "Active users
-- by school" bar chart, the "Users by role" donut, and the PF columns on the
-- School Report were showing almost entirely fake numbers on every school.
--
-- None of these 230 people have a real login, and they have zero other
-- dependent data (no course assignments, no staging rows, nothing) --
-- verified before deleting. The 3 genuinely real activity rows (Noah Barry,
-- Sipho Goniwe, Siyabonga Motloung) are untouched.

DELETE FROM fact.product_fruits_activity
WHERE person_id IN (SELECT id FROM identity.people WHERE notes = 'PF_MOCK');

DELETE FROM identity.people WHERE notes = 'PF_MOCK';
