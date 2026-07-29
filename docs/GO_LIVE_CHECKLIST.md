# Go-live checklist

Target: **live today for testing** — real named teachers, Grade R, 3 roles (super_admin,
school_admin, teacher). Full wider-rollout hardening (§C) can follow after testing starts;
it isn't a blocker for today.

Legend: ☐ to do · ✅ done · Owner: 👤 you · 🤖 Claude · 🖥️ Supabase/Vercel console (yours to
click — Claude writes the exact steps)

---

## A. Blocking — must happen today

- ☐ 👤 **Send the teacher roster** — name, email, school, one per line.
- ☐ 🤖 **Create each teacher record + assign Grade R** (as soon as the roster lands).
- ☐ 👤 **Click "Create N logins"** on the live site (Manage → Teacher logins → Bulk create) —
  one click mints every password; download the CSV it offers.
- ☐ 👤 **Send credentials** to the teachers (the downloaded list).
- ☐ 🤖 **Remove demo data** — the "Demo Teacher — …" accounts and their seeded lesson ticks,
  so testers aren't looking at fake rows next to real ones.
- ☐ 👤 **Decide on the `test-*` accounts** (test-admin/test-schooladmin/test-teacher) — keep
  as your own demo logins, or hide/retire for today?
- ☐ 🤖 **Confirm production env vars** — `SUPABASE_SERVICE_ROLE_KEY` must be set in Vercel or
  the bulk-create/reset buttons will fail. (Check only — I can't set it myself.)
- ☐ 🤖 **Smoke test on the live site**: log in as a real teacher, mark a lesson, confirm it
  shows up in the Teachers/Analytics roll-ups for an admin.
- ☐ 👤 **Confirm the URL** teachers will use (core-group-dashboard.vercel.app, or a custom domain).

## B. Should-do today if there's time

- ☐ 🤖 **Patch the Next.js advisory** (dependency bump — safe, no behaviour change).
- ☐ 🖥️ **Enable CAPTCHA + tune Supabase Auth rate limits** — quick console toggles, real
  teachers' credentials will exist from today.
- ☐ 👤 **One-line teacher how-to** — "go to [URL], log in with the email/password you were
  sent, tick off lessons as you teach them." Cuts first-day confusion.
- ☐ 👤 **Support plan** — teachers email you for resets; the reset flow is Manage → Teacher
  logins → Reset a password (already live).

## C. Before wider rollout (not blocking today's test)

See `docs/SECURITY_CHECKLIST.md` for the full list. Highlights: leaked-password protection,
DB backups/PITR, credential rotation, MFA on the super-admin account, security headers,
teacher-experience polish (mark-module-complete, self-service password change), trends
chart, Grade 1–6 content.

---

### Right now
1. **You:** send the roster, decide on `test-*` accounts, confirm the URL.
2. **Me:** the moment the roster lands — create records, assign Grade R, clean demo data,
   confirm the service-role key is set, and tell you exactly where to click for logins.
3. **You:** one click to mint logins, download + send credentials.
4. **Both:** quick smoke test, then it's live for testing.
