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

**IP restriction.** ARI deliberately does *not* implement IP allowlisting in application middleware — request headers like `X-Forwarded-For` are client-controlled and trivially spoofed or omitted, so any header-based check can be bypassed and only creates false confidence. Restrict access at the network edge instead, where the source IP is authoritative: Vercel Firewall, Cloudflare WAF/Access, an nginx/Caddy `allow`/`deny` block, or host firewall rules (`iptables`/`ufw`/security groups).

## Layer 2: Application-Level Query Filtering (Primary)

Every API route calls `getAuthenticatedUser()` which validates the session server-side and provides a `withRLS()` helper. This helper wraps queries in a transaction that sets `SET LOCAL app.current_user_id`.

**The application-layer query is the real tenant boundary.** Do not rely on implicit DB-level RLS filtering — Postgres superuser roles (including the default `postgres` role used by Supabase and by most local installs) have `BYPASSRLS`, so RLS (Layer 3) does not filter on its own.

### Per-user (private) vs shared (collaborative) data

ARI is multi-user, and each content table is one of two kinds:

- **Per-user (private)** — each user only sees their own rows (fitness, health, journal, notes, and all secrets/config: `module_settings`, `user_preferences`, `api_keys`, OAuth tokens). **Every SELECT/UPDATE/DELETE MUST filter by `user_id = user.id`.**
- **Shared (collaborative)** — all authenticated users read and write the same rows (tasks, contacts, quotes, documents, knowledge-manager, motivation, brainstorm). Reads/writes **must NOT** filter by `user_id`; visibility is intentionally global.

`INSERT` always sets `user_id = user.id` (records the creator/owner) in **both** models.

```typescript
const { user, withRLS } = await getAuthenticatedUser()
if (!user || !withRLS) return unauthorized()

// PER-USER SELECT — filter by user_id
const mine = await withRLS((db) =>
  db.select().from(fitnessLogs).where(eq(fitnessLogs.userId, user.id))
)

// PER-USER UPDATE/DELETE by ID — include both table ID and user_id
await withRLS((db) =>
  db.update(fitnessLogs).set({ note: 'x' })
    .where(and(eq(fitnessLogs.id, id), eq(fitnessLogs.userId, user.id)))
)

// SHARED SELECT/UPDATE/DELETE — NO user_id filter (rows belong to everyone)
const all = await withRLS((db) => db.select().from(tasks))
await withRLS((db) =>
  db.update(tasks).set({ completed: true }).where(eq(tasks.id, id))
)

// INSERT — always set userId (owner), per-user OR shared
await withRLS((db) => db.insert(tasks).values({ title: 'New', userId: user.id }))
```

A per-user query that forgets its `user_id` filter leaks other users' rows; a shared query that keeps one hides shared rows. Keep the API filtering consistent with the table's RLS policy (Layer 3).

## Layer 3: Database RLS Policies (Defense-in-Depth)

RLS policies exist on all tables. These are **not enforced** when the application connects as a Postgres superuser — the default in all three supported `ARI_DB_MODE` values (`postgres`, `supabaselocal`, `supabasecloud`). They serve as defense-in-depth and activate if a restricted database role is used, at which point they must match the app-layer intent:

- **Per-user tables** — `USING (user_id = current_setting('app.current_user_id'))` on SELECT/UPDATE/DELETE.
- **Shared tables** — `USING (app.can_access_shared())` on SELECT/UPDATE/DELETE (the function, defined in `lib/db/setup.sql`, returns true for any authenticated context).
- **Both** — INSERT keeps `WITH CHECK (user_id = current_setting('app.current_user_id'))` so the creator is stamped as owner.

Each module defines its own RLS policies in `database/schema.sql` (auto-run on module enable). See `modules-core/module-template/database/schema.sql` for the canonical policy pattern and how to switch a table between per-user and shared.

### Optional Hardening: Restricted Database Role

For true DB-level enforcement, create a role without `BYPASSRLS` and use it for application connections. This is not required for the default setup — it adds operational complexity for open-source deployments.

## Layer 4: Authorization (Roles & Permissions)

Beyond *authentication* (who you are) and *isolation* (whose rows you see), ARI gates *privileged actions* by role and permission. Every user is `admin` or `user`; admins implicitly hold every permission. Users resolve each permission from the `permissions` JSONB on their `user` row, with code-level defaults in `lib/permissions.ts`:

| Permission | Default (user) | Gates |
|---|---|---|
| `manage_users` | off | create/edit/disable/delete `user`-role accounts |
| `manage_admins` | off | manage admin accounts + change roles |
| `manage_modules` | on | enable/disable/install modules |
| `access_settings` | on | open the Settings page |
| `generate_api_keys` | off | create API keys |

Role and permissions are **read from the live DB row on every request** (never the cookie-cached session), so changes take effect immediately; disabled accounts fail auth entirely. Gate server routes with the helpers in `lib/api-helpers.ts`:

```typescript
const { user } = await getAuthenticatedUser()
if (!user) return createErrorResponse('Authentication required', 401)

const denied = requirePermission(user, 'manage_modules')  // or requireAdmin(user)
if (denied) return denied
```

UI gating is cosmetic — always enforce on the server. Client components read `useCurrentUser()` (`hooks/use-users.ts`) and the helpers `hasPermission` / `canViewUsers` / `canManageRole` from `lib/permissions.ts`. See `CLAUDE.md` and `docs/MODULES.md` for module-author guidance.

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
2. Decide whether the table is **per-user** or **shared** (see Layer 2), and keep the API and the `schema.sql` RLS policy consistent:
   - Per-user: add `.where(eq(table.userId, user.id))` to SELECT, and `.where(and(eq(table.id, id), eq(table.userId, user.id)))` to UPDATE/DELETE by ID
   - Shared: do **not** add a `user_id` filter to reads/writes
3. Set `user_id: user.id` in all INSERT values (both models)
4. Never rely on implicit RLS filtering alone — the default DB role bypasses RLS
5. Gate privileged actions with `requirePermission(user, 'key')` / `requireAdmin(user)` from `lib/api-helpers.ts` (see Layer 4)
6. Use `createErrorResponse()` from `lib/api-helpers.ts` or `safeErrorResponse()` from `lib/api-error.ts` in catch blocks — never expose internal error details to the client
