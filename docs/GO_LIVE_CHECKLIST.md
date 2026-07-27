# Go-live checklist

Target launch: **Wednesday**. Pilot scope: **Grade R**, 3 roles (super_admin, school_admin, teacher).

Legend: ☐ to do · 🔴 blocker (must be done to launch) · 🟡 should-do
Owner: 👤 you · 🤖 Claude · 🖥️ Supabase/Vercel console (yours to click; Claude writes the steps)

---

## 1. Provisioning & data
- ☐ 🔴 👤 Provide the **real teacher roster** — name, email, school (list or CSV).
- ☐ 🔴 🤖 **Bulk-create the teacher logins** with temp passwords; export the credential list.
- ☐ 🔴 🤖 **Assign each teacher to the Grade R course**; confirm Grade/course shows on the Teachers page.
- ☐ 🔴 👤 **Distribute credentials** to teachers (the temp-password list).
- ☐ 🔴 🤖 **Remove demo data** — the "Demo Teacher — …" accounts and their seeded completions.
- ☐ 🔴 👤 **Decide on the `test-*` accounts** — keep as demo logins, or retire them for launch?
- ☐ 🟡 👤 Confirm **which schools** are in the launch (all 12, or a pilot subset).
- ☐ 🟡 👤 Create any **school-admin logins** needed for oversight beyond yourself.
- ☐ 🟡 🤖 After cleanup, verify **Analytics / School Report / Teachers show only real data**.

## 2. Security must-dos (Priority 1 from docs/SECURITY_CHECKLIST.md)
- ☐ 🔴 🤖 **Patch the Next.js advisory** (unauthenticated Server-Function endpoint disclosure) — minor version bump + re-audit.
- ☐ 🔴 🖥️ **Enable CAPTCHA** on Supabase Auth (brute-force / credential-stuffing defence).
- ☐ 🔴 🖥️ **Tune Supabase Auth rate limits** (sign-in attempts per IP/hour).
- ☐ 🟡 🖥️ **Enable leaked-password protection** (Supabase Auth).
- ☐ 🔴 🖥️ **Confirm only the `public` schema is exposed** (Supabase → API settings).
- ☐ 🟡 🖥️ **Enable database backups / PITR** (Supabase).
- ☐ 🟡 👤 **Rotate any dev credentials** (service-role key, Management PAT) if they were ever shared outside the secret store.
- ☐ 🟡 👤 Decide temp-password handling — teachers keep the issued temp password (forced-change-on-first-login isn't built); communicate they can request a reset from you.

## 3. Pre-launch verification (smoke test on production)
- ☐ 🔴 🤖 **Teacher flow**: log in → mark a lesson → confirm it appears in the admin roll-ups.
- ☐ 🔴 🤖 **Password reset**: do one real reset against production, log in with the new password, then reset back (this path was only verified locally up to the service-key boundary).
- ☐ 🟡 🤖 **School-admin flow**: sees all schools, blocked from /manage and /settings.
- ☐ 🟡 🤖 **Super-admin flow**: full access, attention panel + freshness indicator read correctly.
- ☐ 🟡 👤 Check the teacher pages on a **phone/tablet** if teachers will mark lessons in class.

## 4. Ops & comms
- ☐ 🔴 👤 Confirm the **URL teachers will use** (core-group-dashboard.vercel.app, or a custom domain).
- ☐ 🔴 🖥️ Confirm **production env vars are set** in Vercel (esp. `SUPABASE_SERVICE_ROLE_KEY`, or logins/resets fail).
- ☐ 🔴 👤 **Teacher how-to** — a short note on how to log in and mark lessons (cuts week-one support).
- ☐ 🟡 👤 **Support plan** — teachers email you for resets; confirm you know the reset flow (Manage → Teacher logins → Reset a password).
- ☐ 🟡 👤 **Rollback awareness** — Vercel can redeploy the previous version instantly if something breaks.

## 5. Content
- ☐ 🟡 🤖 Confirm **Grade R lessons are complete/correct** (already loaded from Reception.xlsx).
- ☐ 🟡 👤 Confirm **Grade 1–6 are intentionally empty** for this pilot (teachers on Grade R only won't see them).

---

### Fastest path to Wednesday
1. **You:** send the teacher roster + confirm scope + do the Supabase console toggles (§2 🖥️).
2. **Claude:** patch Next.js, bulk-provision + assign, clean demo data, run the production smoke tests.
3. **Both:** distribute credentials + teacher how-to, final walkthrough.
