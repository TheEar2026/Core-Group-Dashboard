# Security close-out checklist

A punch-list to tie the knot on the security stage before wider rollout.
Legend: ✅ verified in code · ⬜ to do · 🔧 code change · ⚙️ Supabase/Vercel config · 📋 process

Last reviewed: 2026-07-23 (Grade R pilot, 3 roles: super_admin, school_admin, teacher).

---

## A. Verified strong (baseline) ✅

These were checked during the review and are in good shape — keep them true as the app grows.

- ✅ **All data access goes through `SECURITY DEFINER` RPCs.** No `identity/catalog/fact/reporting` tables are granted to `anon`/`authenticated`, so the public anon key cannot read/write tables directly.
- ✅ **Every admin mutation RPC checks `is_super_admin()`** (create school/teacher, assign course, link login, ingest, match-resolve).
- ✅ **`set_lesson_complete` is caller-scoped** — no `person_id` param, resolves the caller via `my_person_id()`, and requires the course to be assigned to them. Teachers can only mark their own lessons.
- ✅ **Report RPCs return nothing to teachers** (gated on `is_super_admin`/`is_school_admin`/`my_school_ids`).
- ✅ **Every `SECURITY DEFINER` function pins `search_path`** (blocks search-path privilege escalation).
- ✅ **RLS enabled on all tables**, including the catalog tables. (Enabled + no policy = deny-all for direct access, which is correct here since access is via definer RPCs.)
- ✅ **Auth uses `getUser()`** everywhere (validates the JWT) and the proxy/middleware redirects unauthenticated requests to `/login`.
- ✅ **Service-role key is server-only** (used only in `"use server"` files + `lib/supabase/admin.ts`).
- ✅ **No secrets committed**; `.env*` is gitignored (only the public anon key ships).
- ✅ **CSRF** handled by Next.js Server Actions; **no XSS sinks** (only a static theme `dangerouslySetInnerHTML`).

---

## B. To close out — Priority 1 (before real rollout)

- ⬜ 🔧 **Patch dependencies.** `npm audit` flags a Next.js advisory (unauthenticated disclosure of internal Server Function endpoints, GHSA-955p-x3mx-jcvp), plus postcss and sharp. Bump Next 16.2.10 → 16.2.11 and re-audit.
- ⬜ ⚙️ **Turn on CAPTCHA for auth** (hCaptcha/Turnstile in Supabase Auth) — top defense against credential stuffing / login brute-force.
- ⬜ ⚙️ **Tune Supabase Auth rate limits** (sign-in attempts per IP/hour) — there is no app-level throttle today.
- ⬜ ⚙️ **Enable leaked-password protection + password strength** (Supabase Auth) — covers the weak 8-char minimum centrally.
- ⬜ 🔧⚙️ **Temp-password lifecycle.** Created/reset passwords currently work forever. Force a password change on first login (and/or expire temp passwords).
- ⬜ ⚙️ **Confirm exposed schemas = `public` only** (Supabase → API settings). This is what keeps tables unreachable; verify it hasn't drifted.
- ⬜ 📋 **Remove or lock down demo/test accounts** before launch (the `test-*@theearacademy.com` logins and the `Demo Teacher — …` seed data), or confirm they're intended to stay.
- ⬜ 📋 **Rotate any credentials shared during development** (service-role key, Management API PAT) if they were ever pasted outside the secret store.

## C. Priority 2 (hardening)

- ⬜ 🔧 **Add security headers** (none set today): Content-Security-Policy, Strict-Transport-Security, X-Frame-Options/`frame-ancestors`, X-Content-Type-Options, Referrer-Policy — via `next.config.ts` `headers()`.
- ⬜ 🔧 **Add `import "server-only"` to `lib/supabase/admin.ts`** so an accidental client import becomes a build error.
- ⬜ 🔧 **Sanitize error messages** returned from server actions (return generic text instead of raw Supabase/GoTrue `error.message`).
- ⬜ 🔧 **Teacher self-service password change** (verify current → set new; no SMTP needed).
- ⬜ ⚙️ **Enable database backups / Point-in-Time-Recovery** in Supabase.
- ⬜ ⚙️ **MFA on the super-admin account** — it's the one account that can do everything; highest-value single hardening.

## D. Priority 3 / ongoing

- ⬜ 🔧 **Future LMS completion link:** give it its own rate limiting, and validate the login `next`-redirect as a relative path (open-redirect guard).
- ⬜ 📋 **Recurring dependency audit** (`npm audit` in CI or Dependabot) so advisories don't pile up.
- ⬜ ⚙️ **Monitoring/alerting on auth failures** and unusual admin activity.
- ⬜ 📋 **Handle downloaded password CSVs securely** (delete after distributing to teachers).
- ⬜ 📋 **Re-run this checklist after each new migration or feature** — the biggest risk is a new RPC that forgets its `is_super_admin()` guard or a new table exposed without RLS.

---

## Quick reference: how the security model works

- **Browser → app:** anon key + user JWT in httpOnly cookies; `getUser()` validates the JWT server-side; the proxy gates unauthenticated access.
- **App → database:** only `public.*` RPCs are callable. Each RPC is `SECURITY DEFINER` with a pinned `search_path` and an explicit role/ownership check. Tables live in non-public schemas with RLS on and no direct grants.
- **Privileged ops** (create logins, reset passwords) use the service-role key, server-side only, behind a super-admin check in both the page and the action.
