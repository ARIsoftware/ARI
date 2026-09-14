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

The proxy at `/proxy.ts` (Next.js 16 renamed the `middleware` convention to `proxy`) validates the session cookie before allowing access. API routes return `401 Unauthorized`; page routes redirect to `/sign-in`. API routes may alternatively authenticate via an API key header — full validation still happens server-side in `getAuthenticatedUser()`.

**Public routes are fixed at build time.** The list is compiled into `lib/generated/module-manifest.json` by the registry generator, so a module cannot make one of its routes public at runtime — the declaration must pass through the generator. Public routes skip both authentication *and* the module-enabled check (there is no user context), so each handler must enforce its own security using the primitives in `lib/modules/public-route-security.ts` (`checkRateLimit`, `isSameOriginRequest`, `getClientIp`). The `security` block a public route declares in `module.json` is metadata that documents the intent — the framework enforces nothing on its behalf.

**Sign-up is disabled at the middleware level.** `POST /api/auth/sign-up*` returns `403`; only server-side bootstrap (via the `/welcome` setup flow or `ARI_FIRST_RUN_ADMIN_*` env vars) can create accounts.

**IP restriction.** ARI deliberately does *not* implement IP allowlisting in application middleware — request headers like `X-Forwarded-For` are client-controlled and trivially spoofed or omitted, so any header-based check can be bypassed and only creates false confidence. Restrict access at the network edge instead, where the source IP is authoritative: Vercel Firewall, Cloudflare WAF/Access, an nginx/Caddy `allow`/`deny` block, or host firewall rules (`iptables`/`ufw`/security groups).

## Layer 2: Application-Level Query Filtering (Primary)

Every API route calls `getAuthenticatedUser()` which validates the session server-side and provides a `withRLS()` helper. This helper wraps queries in a transaction that sets `SET LOCAL app.current_user_id`.

**Two layers enforce the same rule.** Request-path queries run as the non-BYPASSRLS `ari_app` role (Layer 3), so Postgres evaluates every RLS policy — but the explicit application-layer filter stays mandatory. It is the only boundary whenever ARI runs on the privileged role instead: the kill switch, an install whose `DATABASE_URL` role cannot create roles, the first seconds after a fresh install, or a connection failure on the app pool (which falls back for one minute at a time). Write every query as if RLS did not exist; RLS is there to catch the query you got wrong.

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

## Layer 3: Database RLS Policies (Enforced by Postgres)

RLS policies exist on every table, and Postgres enforces them for the request path: `withRLS()` / `withUserContext()` acquire their connection from a second pool that logs in as **`ari_app`**, a role with `NOSUPERUSER NOBYPASSRLS NOINHERIT` that owns nothing. Everything else — Better Auth, first-run bootstrap, `setup.sql`, module DDL, backups, `withAdminDb`, the activity log, telemetry — stays on the privileged `DATABASE_URL` role. Policies must therefore match the app-layer intent exactly:

- **Per-user tables** — `USING (user_id = (SELECT current_setting('app.current_user_id', true)))` on SELECT/UPDATE/DELETE, and the same predicate as the UPDATE `WITH CHECK`.
- **Shared tables** — `USING ((SELECT app.can_access_shared()))` on SELECT/UPDATE/DELETE (the function, defined in `lib/db/setup.sql`, is true for any authenticated context), plus the `app.prevent_user_id_reassignment()` trigger so nobody can take ownership of a shared row.
- **Both** — INSERT keeps `WITH CHECK (user_id = (SELECT current_setting('app.current_user_id', true)))` so the creator is stamped as owner.

Policy authoring rules, all pinned by `tests/unit/lib/db/policy-contract.test.ts`:

- `current_setting('app.…', true)` — always pass `missing_ok`, so a connection without context denies instead of erroring.
- Wrap `app.can_access_shared()` and `current_setting(…)` as `(SELECT …)` — the planner then evaluates them once per statement (an InitPlan) instead of once per row; bare, `can_access_shared()` cannot be inlined and runs for every row scanned.
- Spell out `WITH CHECK` on every `FOR UPDATE` policy (Postgres reuses USING when it is omitted; the explicit form keeps intent visible).
- Every per-user table has an index whose leading column is `user_id`.
- Shared tables attach the ownership trigger; `SECURITY DEFINER` functions are followed by `REVOKE ALL … FROM PUBLIC`.

Each module defines its own RLS policies in `database/schema.sql` (auto-run on module enable). See `modules-core/module-template/database/schema.sql` for the canonical pattern and how to switch a table between per-user and shared.

**Deny-all tables are never read through `withRLS()`.** `user`, `session`, `account`, `verification`, `twoFactor` and `ari_instance` carry `USING (false)` policies, and `activity_log` reads are admin-only. On the app role such a query returns **no rows, silently** — it does not error. Read them through `withAdminDb()` (or the raw pool) after your own authorization check, the way the tasks assignee picker and `lib/auth-helpers.ts` do. `tests/unit/route-security-scan.test.ts` fails any route or `lib/` file that breaks this.

### DB-level RLS enforcement: the `ari_app` role

**What it protects against.** Application bugs: a per-user query that forgot its `user_id` filter, a wrong shared/per-user classification, a module that returns another user's row. Postgres now refuses those reads and writes regardless of what the TypeScript said.

**What it does not protect against.**

- *Operators.* Anyone holding `DATABASE_URL` holds the privileged role and can read everything; the app role only changes what the *application* can do.
- *SQL injection.* Identity is a session setting. Injected SQL can run `(SELECT set_config('app.current_user_id', '<victim>', true))` inside the very statement being attacked and the policies will honour it. Parameterised queries remain the injection control; RLS does not replace them.

**Deployment topology: everyone holding `DATABASE_URL` is an operator.** Isolation between users exists only between *browser accounts on one ARI server*. A team that instead runs ARI locally on each machine against one shared database has handed every teammate the privileged credentials: each can read any table directly, set `ARI_DISABLE_RLS_ENFORCEMENT`, or `SET app.current_user_id` to anyone in a SQL client — nothing in ARI can prevent that, because the trust boundary is the credential, not the code. Run one ARI instance per team (Vercel plus a hosted Postgres is the intended shape) and let teammates sign in to it. If several instances must share a database anyway (preview environments, a lambda fleet), they must share `BETTER_AUTH_SECRET` — see the runbook below — and whoever boots first applies schema changes for everyone.

**How it works.**

- **Provisioning (`lib/db/app-role.ts`).** On every boot, after `setup.sql`, ARI reads the app role's password from `ari_instance.app_role_secret` (AES-encrypted with the key derived from `BETTER_AUTH_SECRET`, the same scheme as stored API keys). If it decrypts, that is the whole boot cost: one `SELECT`. Otherwise ARI takes a transaction-scoped advisory lock, creates or repairs `ari_app` with a fresh random password (`CREATE ROLE` / `ALTER ROLE`), stores it with a rotation stamp, applies the grants, commits, and only then test-connects as the role. Grants are `USAGE` on `public` and `app`, `EXECUTE` on the `app` functions, `SELECT/INSERT/UPDATE/DELETE` on all `public` tables, `ALTER DEFAULT PRIVILEGES` so future module tables are granted at `CREATE` time, and `REVOKE` on the three `SECURITY DEFINER` backup RPCs. The role is never made an owner — non-ownership is what makes RLS apply to it.
- **The app pool (`lib/db/app-pool.ts`).** Created lazily from that password with the same tuning as the privileged pool, connecting as `ari_app` (or `ari_app.<project-ref>` on Supabase's Supavisor pooler, which encodes the tenant in the username). `withUserContext()` takes its connection here when the pool is healthy and appends `SET LOCAL app.enforced = 'on'` to the context statement — the flag that arms the ownership trigger, so the trigger is live exactly when enforcement is.
- **Degrade, never break.** Pool selection happens only when a connection is acquired. A failed connect snoozes the app pool for 60 s (that call and the ones after it run on the privileged role, exactly as before this feature); a bad password (`28P01`) or a missing role (`28000`) additionally drops the pool and repairs the role in the background, so `DROP ROLE` or an out-of-band password change heals without a restart. Forced repairs are rate-limited to one per minute per process. An operation's *outcome* never moves it to the privileged pool: the single retry that exists is a `42501 permission denied for table …` on a table created after the last grant sweep, which re-runs the grants and retries once **on the app pool**. `new row violates row-level security policy` shares that SQLSTATE and is rethrown untouched.
- **Kill switch.** `ARI_DISABLE_RLS_ENFORCEMENT=1` restores the pre-enforcement behaviour completely: the role is neither provisioned nor used, and because `app.enforced` is never set, the ownership trigger is inert too. No code change; a restart locally, a redeploy on Vercel. `DATABASE_APP_POOL_MAX` sizes the app pool (default: `DATABASE_POOL_MAX`, then 3 in production / 10 in development — a serverless instance holds both pools).
- **Unsupported databases.** If the `DATABASE_URL` role lacks `CREATEROLE`, provisioning reports *unsupported* and ARI runs permanently on the privileged role. Nothing breaks; `/health` says so.

**Observability.** The `/health` RLS tab shows the real state — green *RLS is enforced* only when request-path queries run as `ari_app` and that role cannot bypass; calm yellow while the app runs on the privileged role (fallback, not provisioned, unsupported); grey under the kill switch; red only if `ari_app` ever gains `BYPASSRLS`. The same tab shows whether the role owns no tables, the fallback and grant-miss counters (steady state: 0) and the last transition. *Test RLS Policies* on the Database tab reports which role ran it; on the app role its negative test is real. `/api/health/full` carries an *RLS Enforcement* check that is warning-level while in fallback and fails only for a bypassing app role. Every entry into and exit from fallback writes one `activity_log` row (`rls_enforcement_fallback` / `rls_enforcement_restored`).

**Runbook.**

- *Rotation.* The password is rotated whenever the stored secret is missing or cannot be decrypted with the current `BETTER_AUTH_SECRET` — a restored backup from another install, or a rotated secret. Nothing to do; the next boot repairs it.
- *Several deployments on one database* (preview environments, a fleet of lambdas) **must share `BETTER_AUTH_SECRET`**. A secret that does not decrypt but was rotated less than 15 minutes ago is treated as another deployment's: ARI runs in fallback and reports *secret-mismatch* instead of rotating it back and forth.
- *Removing the role.* `DROP OWNED BY ari_app; DROP ROLE ari_app;` (both statements — grants and default privileges are dependencies, so a bare `DROP ROLE` fails). ARI recreates it as soon as a request finds it missing — in the background, within a minute, whether that happens live or after a restart (the boot fast path trusts the stored secret; the first app-pool connect is the probe).
- *Password changed by hand.* Same self-heal as a dropped role: the next app-pool connect fails, the role is repaired, requests continue on the privileged role meanwhile.
- *Turning it off.* `ARI_DISABLE_RLS_ENFORCEMENT=1` and restart. The role and the two `ari_instance` columns linger harmlessly.

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

## Layer 5: Module Supply Chain (Install-Time)

Layers 1–4 govern what a *request* can reach. This layer governs what can be *installed* in the first place: a module is third-party code that ships pages, API routes, npm dependencies, and SQL.

### Installing a module

`POST /api/modules/download` (`app/api/modules/download/route.ts`) is gated by `requirePermission(user, 'manage_modules')` — authentication alone is not sufficient.

### Archive extraction (Zip Slip)

The installer uses a pure Node `zlib` extractor that rejects, before writing any file:

- absolute paths and Windows drive letters (`C:\…`)
- any `..` path segment
- any entry whose *resolved* destination falls outside the extraction directory

### npm dependencies

Declared in `module.json` under `npmDependencies` and installed by `lib/modules/npm-installer.ts`:

- **Cap of 25 packages per module**; names must match a strict npm-name pattern; version specs ≤ 100 characters.
- **Forbidden spec tokens** — `git:`, `http:`, `https:`, `file:`, `link:`, `workspace:`, `npm:`, `..` — any of which would let a module pull code from an arbitrary source.
- **Conflict policy: abort, never silently upgrade.** The check is generic: if the host's root `package.json` already pins the package at a range incompatible with the module's, the install fails with the two versions named, rather than resolving it. In practice the packages this protects are the shared framework ones (`react`, `next`, `drizzle-orm`, `better-auth`), since a module install must never move the host off its own framework versions.
- A module-level mutex serializes installs so concurrent requests cannot race pnpm's lockfile.

### Module SQL

`lib/modules/schema-installer.ts` scans every `schema.sql` **before** executing it. SQL comments are stripped first, so a forbidden statement cannot hide behind `--`. Refused outright:

| Refused | Allowed (required for re-runnable schema) |
|---|---|
| `DROP TABLE`, `DROP SCHEMA`, `DROP DATABASE` | `DROP POLICY` |
| `TRUNCATE` | `DROP INDEX` |
| `ALTER TABLE … DROP COLUMN` | `DROP TRIGGER` |
| `DELETE FROM <table>` with no `WHERE` | |

A match means the file is not executed and the module does not enable. If the scan passes, the whole file runs inside a **single transaction** — a partially applied schema is impossible.

`database/uninstall.sql` is **never read by any code path** — not the loader, not an enable/disable hook, not an API route. It exists only so a user can run teardown manually in psql, pgweb, or Supabase Studio.

### Unvalidated code cannot run

The module loader never scans the filesystem at runtime — it reads the pre-generated manifest. `scripts/generate-module-registry.js` validates each module at build time and emits static registries under `lib/generated/`; the application imports only those. A module that fails validation is unreachable — there is no dynamic `require` of module code. See `docs/MODULES.md` §1.

## Authentication Hardening

- **Password hashing.** Argon2id (OWASP-recommended; winner of the Password Hashing Competition). Minimum password length: 18 characters.
- **Rate limiting.** Built into Better Auth. Default: 30 req/min across all auth endpoints, with custom limits on critical paths:
  - `/sign-in/*` — 5 attempts per 5 minutes
  - `/sign-up/*` — 3 attempts per 5 minutes
  - `/two-factor/verify-totp` — 5 attempts per minute
  - `/get-session` — 500 req/minute (read-only, cookie-cached)
- **Session storage.** HTTP-only cookies (not `localStorage`); `Secure` flag in production.
- **Client IP for rate limiting.** Proxy headers (`X-Forwarded-For`, `X-Real-IP`) are client-forgeable, so ARI's public-route rate limiter ignores them unless something trustworthy set them: the Vercel platform (which overwrites `X-Forwarded-For`), or a reverse proxy you control — declare it by setting `ARI_TRUST_PROXY=1`. Without a trusted header source there is no per-client identity available to the app, so direct clients share one rate-limit bucket; use edge/network controls for per-IP enforcement (see IP restriction above). Note that Better Auth's own sign-in limiter reads `X-Forwarded-For` independently — behind a proxy, make sure the proxy overwrites (not appends to) that header.

## Security Headers

Set in `/proxy.ts`:

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
4. Never rely on RLS alone — keep the explicit filters. ARI runs on the privileged (bypassing) role whenever the app role is unavailable, on installs whose `DATABASE_URL` role lacks `CREATEROLE`, and under the kill switch; RLS is the second layer, not the only one
5. Gate privileged actions with `requirePermission(user, 'key')` / `requireAdmin(user)` from `lib/api-helpers.ts` (see Layer 4)
6. Use `createErrorResponse()` from `lib/api-helpers.ts` or `safeErrorResponse()` from `lib/api-error.ts` in catch blocks — never expose internal error details to the client
7. Write policies the way `tests/unit/lib/db/policy-contract.test.ts` expects: `current_setting('app.…', true)`, `(SELECT …)`-wrapped calls, explicit `WITH CHECK` on UPDATE, a `user_id` index — and never read a deny-all table (`user`, `session`, `ari_instance`, …) through `withRLS()`; use `withAdminDb()` after your own authorization check
8. In **module** code, never shell out (`child_process`, `exec`, `spawn`), never `eval` / `new Function` / `vm.run`, never recursively delete from the filesystem, and never issue a `db.delete()` / `db.update()` without a `.where(...)` scoped to the owner. Core infrastructure has a few narrow, reviewed exceptions (e.g. `lib/modules/npm-installer.ts` spawning `pnpm`); a module has none.
