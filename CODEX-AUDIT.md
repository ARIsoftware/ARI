# CODEX Security Audit

Date: 2025-09-03
Scope: Next.js app, API routes, Supabase auth/RLS, SQL scripts, middleware, env usage

## Executive Summary
The project has solid foundations (Supabase RLS, auth middleware, per-user clients), but several critical exposures remain:
- Service role key is used in user-facing API routes, bypassing RLS and risking cross-user data access.
- An unauthenticated debug endpoint exposes database metadata and sample rows.
- Destructive migration endpoints exist with minimal authorization controls.
- Backup import/export endpoints use service role access without admin gating.
Address these immediately, then tighten logging, validation, headers, and rate limiting.

## Critical Findings
- Unauthenticated debug endpoint: `app/api/debug-db/route.ts`
  - Uses anon client; exposes table counts, sample data, and environment presence. Middleware does not protect `/api/*` by default here and the route lacks auth.
  - Fix: Remove in production or require admin authorization; return 404/403 when not in development.

- Service role in user-facing APIs: `app/api/hyrox/*`
  - Files: `hyrox/workouts`, `hyrox/workout-stations`, `hyrox/station-records`, `hyrox/reset` create a Supabase client with `SUPABASE_SECRET_KEY` (service role), bypassing RLS.
  - Example leak: `hyrox/workouts/route.ts` GET returns all completed workouts without `user_id` scoping.
  - Fix: Use user-scoped clients from `getAuthenticatedUser()`; rely on RLS; explicitly filter by `user_id = user.id`; remove service role usage from these routes.

- Dangerous migration endpoints: `app/api/migrate-with-jwt/route.ts`, `app/api/migrate-data/route.ts`
  - Perform bulk delete/insert (e.g., `DELETE FROM "ari-database"`) with only basic auth; include excessive logging of sample records.
  - Fix: Disable behind env gate (e.g., `NODE_ENV !== 'production'`); require admin role; add confirmations; remove data-destructive ops from codebase if possible.

- Backup import/export not admin-gated: `app/api/backup/export/route.ts`, `app/api/backup/import/route.ts`
  - Use service role to enumerate/export/import all tables; any authenticated user can trigger full backup/import.
  - Import executes raw SQL via `rpc('exec_sql', { sql })` without strong constraints.
  - Fix: Restrict to admins (allowlist `ADMIN_USER_IDS` or role claim); add strict file validation; consider moving to ops-only tooling.

## High Severity
- Excessive console logging: multiple API routes log counts, records, and errors (e.g., migration and backup endpoints).
  - Fix: Introduce a logger with level control; redact PII; disable verbose logs in production.

- Service role in shared libs: `lib/hyrox.ts` uses service role and is imported by `app/hyrox/page.tsx` for `testHyroxDatabase()`.
  - Risk: Conceptual misuse and potential schema leakage if accidentally enabled; keep service role usage server-only.
  - Fix: Move admin functions to server-only modules (Route Handlers/Server Actions) and do not import in client components.

## Medium Severity
- Input validation gaps: many routes accept JSON bodies without schema validation.
  - Fix: Add Zod validation for request payloads; enforce types and constraints (IDs, lengths, enums).

- Missing rate limiting on APIs.
  - Fix: Add simple token bucket/limiter (e.g., edge-compatible) for sensitive endpoints (backup, migration, write ops).

- Security headers minimal.
  - Fix: Add CSP, HSTS, X-Frame-Options, X-Content-Type-Options via Next middleware/headers.

- CSRF posture: Auth relies on cookies; endpoints accept JSON. Cross-site form posts won’t match JSON, but fetch+credentials could be abused if CORS misconfigured later.
  - Fix: Require Authorization bearer token for mutating routes or implement CSRF token for cookie-based auth.

## Low Severity
- UI cookie without attributes: `components/ui/sidebar.tsx` writes a preference cookie via `document.cookie` without `Secure`/`SameSite` flags.
  - Fix: Add `; samesite=lax` and `; secure` in production.

- Debug helpers: `components/rls-debug.tsx` logs JWT claims (unused, but keep dev-only).

- `dangerouslySetInnerHTML` in `components/ui/chart.tsx` builds CSS variables from config.
  - Fix: Ensure `ChartConfig` is never user-controlled; do not pass untrusted values.

## Positive Controls
- RLS in place for core tables; many API routes use per-user clients and rely on RLS.
- Middleware refreshes sessions and blocks protected pages; `X-Robots-Tag: noindex` set.
- Secrets: `.env*` is gitignored; `NEXT_PUBLIC_*` used for client; service role keys accessed only via server env in most places.

## Prioritized Remediation Plan
1) Immediate (today)
- Remove or admin-gate `app/api/debug-db/route.ts`.
- Replace service role usage in `app/api/hyrox/*` with user-scoped clients; enforce `user_id` filters.
- Disable migration endpoints in production; add admin checks and remove destructive operations.
- Lock down backup import/export to admins; add robust validation and confirmations.

2) Short-term (this week)
- Add Zod validation to all write endpoints.
- Implement rate limiting on API routes.
- Add security headers (CSP, HSTS, XFO, XCTO) via `next.config.mjs` or Middleware.
- Remove verbose console logging from production and redact sensitive fields in errors.

3) Medium-term
- Split server-only admin utilities into isolated modules not importable by client components.
- Add audit logging for admin actions (backup/import/migration) and 2FA for admin accounts.
- Add CI checks for prohibited patterns (e.g., service role usage in client, `console.log` in prod, raw SQL execution).

## Suggested Admin Check Pattern
- In `lib/auth-helpers.ts`, add an `assertAdmin(user)` that checks:
  - `process.env.ADMIN_USER_IDS` (comma-separated IDs) or a custom JWT claim.
  - Use in backup/migration routes; return 403 when not authorized.

---
This audit reflects repository state at the time of review. I can implement any of the above fixes or supply patches for the highest‑priority items on request.
