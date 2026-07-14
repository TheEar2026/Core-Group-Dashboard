# Core Group Dashboard

Dashboard project backed by Supabase project `uvxpngmnczixgkzhvaly` (eu-west-1).

## Supabase

The database schema is tracked in `supabase/migrations/`, exported from the live project.
It covers four custom schemas:

- `identity` — people, schools, teachers, admins, and role-based access
- `staging` — raw loads from source systems (Drived, LMS, Vimeo, Product Fruits)
- `fact` — cleaned/joined usage and engagement data
- `reporting` — views combining the above for dashboard consumption

Row Level Security is enabled across all application tables. Access is scoped by
school/person via helper functions (`identity.is_super_admin()`, `identity.my_school_ids()`,
`identity.my_person_id()`).

Only the `public` schema is exposed over the PostgREST API; the custom schemas above are
accessed via `SECURITY DEFINER` functions/views or server-side connections.

To apply the schema to a fresh Supabase project with the Supabase CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```
