# Security close-out checklist

A punch-list to tie the knot on the security stage before wider rollout.
Legend: ✅ verified/done · ⬜ to do · 🔧 code change · ⚙️ Supabase/Vercel config · 📋 process

Last reviewed: 2026-07-30 (Grade R pilot, 3 roles: super_admin, school_admin, teacher).

---

## A. Verified strong (baseline) ✅

These were checked during the review and are in good shape — keep them true as the app grows.

- ✅ **All data access goes through `SECURITY DEFINER` RPCs.** No `identity/catalog/fact/reporting` tables are granted to `anon`/`authenticated`, so the public anon key cannot read/write tables directly.
- ✅ **Every admin mutation RPC checks `is_super_admin()`** (create school/teacher, assign course, link login, ingest, match-resolve).
- ✅ **`set_lesson_complete`/`set_module_complete` are caller-scoped** — no `person_id` param, resolves the caller via `my_person_id()`, and requires the course to be assigned to them. Teachers can only mark their own lessons.
- ✅ **Report RPCs return nothing to teachers** (gated on `is_super_admin`/`is_school_admin`/`my_school_ids`).
- ✅ **Every `SECURITY DEFINER` function pins `search_path`** (blocks search-path privilege escalation).
- ✅ **RLS enabled on all tables**, including the catalog tables. (Enabled + no policy = deny-all for direct access, which is correct here since access is via definer RPCs.)
- ✅ **Auth uses `getUser()`** everywhere (validates the JWT) and the proxy/middleware redirects unauthenticated requests to `/login`.
- ✅ **Service-role key is server-only** — used only in `"use server"` files + `lib/supabase/admin.ts`, which now also carries `import "server-only"` so an accidental client-side import fails the build instead of shipping the key to the browser.
- ✅ **No secrets committed**; `.env*` is gitignored (only the public anon key ships).
- ✅ **CSRF** handled by Next.js Server Actions; **no XSS sinks** (only a static theme `dangerouslySetInnerHTML`, now allow-listed by hash in the CSP below rather than blanket-trusted).
- ✅ **Only `public` (+ `graphql_public`) is exposed over PostgREST** (Supabase → API settings) — checked directly against the live project, no drift.

---

## B. Closed out this pass ✅

- ✅ **Patched dependencies.** Next.js bumped 16.2.10 → 16.2.12 (resolves GHSA-955p-x3mx-jcvp, the unauthenticated Server Function endpoint disclosure, plus the other Next-specific CVEs in the same advisory batch). `eslint-config-next` bumped to match. Rebuilt and typechecked clean.
  - Residual: `npm audit` still flags postcss/sharp advisories *bundled inside* Next's own dependency tree at the latest available stable release (16.2.12) — there's no newer stable Next version yet, and force-overriding a framework's vendored transitive deps risks breaking image optimization/CSS processing. Re-run `npm audit` after the next Next.js patch release.
  - Residual: an `eslint`/`brace-expansion` devDependency advisory remains; it's build-tooling only (not shipped to production) and the automatic fix is a major eslint version bump flagged as breaking, so left alone for now.
- ✅ **Enabled leaked-password protection** (`password_hibp_enabled`) and **raised the server-side minimum password length from 6 → 8** via the Supabase Management API, matching the `minLength={8}` already enforced client-side on the reset-password form (previously the server would have silently accepted a 6-7 character password if the client check were ever bypassed).
- ✅ **Confirmed exposed schemas = `public` only** — checked directly via the Management API, no drift.
- ✅ **Removed demo/test data** (see go-live cleanup) — the six "Demo Teacher — …" accounts and their 317 seeded fake lesson completions, plus "Brandon Test School"/"Brandon Bobbs". `test-admin@`, `test-schooladmin@`, `test-teacher@theearacademy.com` are kept intentionally as standing test logins.
- ✅ **Added security headers** via `next.config.ts` `headers()`: Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. Verified with a real browser (login + teacher flows, including the module-complete/checkbox interactions) — no console errors, nothing broken.
  - The CSP's `script-src`/`style-src` allow `'unsafe-inline'`: Next.js streams RSC hydration data via inline `<script>` tags on every page, and the app uses React inline `style={{...}}` throughout for dynamic colors. A nonce-based CSP would tighten this further but needs per-request nonce plumbing through the proxy middleware — a good next step if you want to invest further here, not done in this pass.
- ✅ **Sanitized error messages on page-load data fetches** (Dashboard, Analytics, Teachers, My Courses, Lesson Progress): a super-admin still sees the real Supabase/Postgres error (useful for debugging), everyone else gets a generic "something went wrong" message, via a shared `safeErrorMessage()` helper. Left admin-only mutation actions (Manage → create/reset/ingest/match) showing the real error — only the super-admin who triggered them ever sees it, and the detail is genuinely useful there.

## C. Still open — Priority 1 (before wider rollout)

- ⬜ 🔧⚙️ **Temp-password lifecycle** (force a password change on first login). Deliberately not built this pass — it needs a teacher-facing "set a new password" form, and you've said all resets go through you manually rather than any self-service flow. Revisit only if that policy changes.
- ⬜ 📋 **Rotate credentials pasted into this chat session.** The Supabase Management API personal access token used to apply migrations this session (and an earlier one that has since 401'd) were both pasted directly into the conversation. Treat both as exposed and rotate the current one at supabase.com/dashboard/account/tokens once you're done needing me to run migrations for a while — chat transcripts persist, so a live admin token sitting in one is a standing risk. Also worth double-checking the service-role key itself was never pasted the same way.

## D. Priority 2 (hardening) — declined

Explicitly decided against for now — not gaps we missed, just called out of scope on purpose:

- ❌ **CAPTCHA for auth** (hCaptcha/Turnstile) and the sign-in-rate-limiting that rides on it. Would've needed a third-party provider signup + a login-form widget; skipped.
- ❌ **MFA on the super-admin account.** The backend capability is already enabled at the Supabase Auth level (`mfa_totp_enroll_enabled`/`mfa_totp_verify_enabled` are both on) if this is ever revisited, but building the enrollment UI is skipped for now.
- ❌ **Database backups / Point-in-Time-Recovery** — a Supabase plan/billing decision, left as-is.
- ❌ **Teacher self-service password change** — you're handling all resets manually.

## E. Priority 3 / ongoing

- ⬜ 🔧 **Future LMS completion link:** give it its own rate limiting, and validate the login `next`-redirect as a relative path (open-redirect guard).
- ⬜ 📋 **Recurring dependency audit** (`npm audit` in CI or Dependabot) so advisories don't pile up.
- ⬜ ⚙️ **Monitoring/alerting on auth failures** and unusual admin activity.
- ⬜ 📋 **Handle downloaded password CSVs securely** (delete after distributing to teachers).
- ⬜ 📋 **Re-run this checklist after each new migration or feature** — the biggest risk is a new RPC that forgets its `is_super_admin()` guard or a new table exposed without RLS.

---

## Quick reference: how the security model works

- **Browser → app:** anon key + user JWT in httpOnly cookies; `getUser()` validates the JWT server-side; the proxy gates unauthenticated access; response headers carry a CSP, HSTS, and the other hardening headers from `next.config.ts`.
- **App → database:** only `public.*` RPCs are callable. Each RPC is `SECURITY DEFINER` with a pinned `search_path` and an explicit role/ownership check. Tables live in non-public schemas with RLS on and no direct grants. Only `public`/`graphql_public` are exposed over PostgREST.
- **Privileged ops** (create logins, reset passwords) use the service-role key, server-side only (guarded by `import "server-only"`), behind a super-admin check in both the page and the action.
- **Passwords:** Supabase Auth enforces an 8-character minimum and rejects known-breached passwords (HIBP) server-side, in addition to the app's own client-side checks.
