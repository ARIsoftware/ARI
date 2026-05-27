# ARI Security: Data Isolation Architecture

ARI uses a layered approach to protect user data. No single layer is solely responsible — they work together to ensure data isolation.

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** button on the [Security tab](https://github.com/ARIsoftware/ARI/security) to open a private advisory. Please do not file public issues for security reports.

## Layer 1: Middleware Authentication (Primary)

All routes require authentication via Better Auth session cookies, except:

- `/sign-in`, `/auth/*`, `/api/auth/*` (sign-in UI and Better Auth handlers)
- `/welcome`, `/setup-error` (first-run wizard before `DATABASE_URL` is configured)
- `/database-error`, `/robots.txt`, `/manifest.json`
- Module-declared public routes — sourced at build time from each module's `module.json` and from core routes that `export const isPublic = true`

The middleware at `/middleware.ts` validates the session cookie before allowing access. API routes return `401 Unauthorized`; page routes redirect to `/sign-in`. API routes may alternatively authenticate via an API key header — full validation still happens server-side in `getAuthenticatedUser()`.

**Sign-up is disabled at the middleware level.** `POST /api/auth/sign-up*` returns `403`; only server-side bootstrap (via the `/welcome` setup flow or `ARI_FIRST_RUN_ADMIN_*` env vars) can create accounts.

**Optional IP allowlist.** Setting `ALLOWED_IPS` (comma-separated IPs and/or hostnames) rejects requests from any other origin at the middleware. Loopback (`127.0.0.1`, `::1`, `localhost`) is always permitted.

## Layer 2: Application-Level Query Filtering (Primary)

Every API route calls `getAuthenticatedUser()` which validates the session server-side and provides a `withRLS()` helper. This helper wraps queries in a transaction that sets `SET LOCAL app.current_user_id`.

**All SELECT/UPDATE/DELETE queries MUST include explicit user ID filters.** Do not rely on implicit DB-level RLS filtering — Postgres superuser roles (including the default `postgres` role used by Supabase and by most local installs) have `BYPASSRLS`.

```typescript
const { user, withRLS } = await getAuthenticatedUser()
if (!user || !withRLS) return unauthorized()

// SELECT — always filter by user_id
const rows = await withRLS((db) =>
  db.select().from(tasks).where(eq(tasks.userId, user.id))
)

// UPDATE/DELETE by ID — always include both table ID and user_id
await withRLS((db) =>
  db.update(tasks)
    .set({ title: 'Updated' })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)))
)

// INSERT — always set userId explicitly
await withRLS((db) =>
  db.insert(tasks).values({ title: 'New', userId: user.id })
)
```

## Layer 3: Database RLS Policies (Defense-in-Depth)

RLS policies exist on all tables using `current_setting('app.current_user_id')`. These are **not enforced** when the application connects as a Postgres superuser — the default in all three supported `ARI_DB_MODE` values (`postgres`, `supabaselocal`, `supabasecloud`). They serve as defense-in-depth and activate if a restricted database role is used.

Each module defines its own RLS policies in `database/schema.sql` (auto-run on module enable). See `modules-core/module-template/database/schema.sql` for the canonical policy pattern.

### Optional Hardening: Restricted Database Role

For true DB-level enforcement, create a role without `BYPASSRLS` and use it for application connections. This is not required for the default setup — it adds operational complexity for open-source deployments.

## Authentication Hardening

- **Password hashing.** Argon2id (OWASP-recommended; winner of the Password Hashing Competition). Minimum password length: 18 characters.
- **Rate limiting.** Built into Better Auth. Default: 30 req/min across all auth endpoints, with custom limits on critical paths:
  - `/sign-in/*` — 5 attempts per 5 minutes
  - `/sign-up/*` — 3 attempts per 5 minutes
  - `/two-factor/verify-totp` — 5 attempts per minute
  - `/get-session` — 500 req/minute (read-only, cookie-cached)
- **Session storage.** HTTP-only cookies (not `localStorage`); `Secure` flag in production.

## Security Headers

Set in `/middleware.ts`:

| Header | Value |
|--------|-------|
| Content-Security-Policy | `unsafe-eval` only in development; `unsafe-inline` kept (Next.js requirement) |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains; preload` |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| X-XSS-Protection | `1; mode=block` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(), microphone=(), geolocation=()` |
| X-Robots-Tag | `noindex, nofollow` |

## TLS / SSL Configuration

The Postgres connection pool (`lib/db/pool.ts`) selects TLS settings from the `DATABASE_URL` host:

- **`localhost` / `127.0.0.1`** — TLS disabled (local development).
- **Any other host** — TLS enabled with `rejectUnauthorized: false`.

The non-local default tolerates self-signed certificates seen on managed Postgres providers and Supabase pooler endpoints. If you require strict certificate validation, customize `pool.ts` for your deployment and pin the CA bundle.

HTTPS at the edge (Vercel or your reverse proxy) is unaffected and should be enforced separately.

## API Security Checklist for Contributors

When writing new API routes or module APIs:

1. Call `getAuthenticatedUser()` and verify both `user` and `withRLS` exist
2. Add `.where(eq(table.userId, user.id))` to all SELECT queries
3. Add `.where(and(eq(table.id, id), eq(table.userId, user.id)))` to UPDATE/DELETE by ID
4. Set `user_id: user.id` in all INSERT values
5. Never rely on implicit RLS filtering alone
6. Use `createErrorResponse()` from `lib/api-helpers.ts` or `safeErrorResponse()` from `lib/api-error.ts` in catch blocks — never expose internal error details to the client
