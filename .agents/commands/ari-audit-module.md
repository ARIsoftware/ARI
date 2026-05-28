# ARI Module Audit (`/ari-audit-module`)

Audit a single ARI module for **security vulnerabilities**, **production-readiness**, **Supabase / Postgres best practices**, and **frontend quality** (performance, data fetching patterns, UX, accessibility). Produces one consolidated report with findings grouped by **High / Medium / Low** severity.

This is a **static code review**. It does not execute SQL, does not modify any files, and does not replace penetration testing or runtime monitoring.

> **Important**: Do not change any code or attempt to fix any issue unless the user explicitly asks you to. This command is read-only.

---

## Usage

```
/ari-audit-module <module-id>
```

- `<module-id>` is the folder name under `modules-core/` or `modules-custom/` (e.g. `tasks`, `notepad`, `quotes`).
- **The argument is required.** If the user invokes `/ari-audit-module` with no argument:
  1. List every directory under `modules-core/` and `modules-custom/`.
  2. Ask the user which one to audit.
  3. Do not proceed until they pick one.
- Audit **exactly one module per run**. Do not fan out to all modules — that produces an unreadable wall of text.

---

## Severity model

All findings are normalized into three buckets. There is no "Critical" — anything previously labeled CRITICAL maps to **High**.

- **High** — Immediate exploitation risk, auth bypass, data exposure, destructive SQL in install scripts, missing RLS, missing auth check on a state-changing handler.
- **Medium** — Significant weakness exploitable under certain conditions, missing input validation, unsafe error responses, missing registration that breaks the module at install time.
- **Low** — Best-practice violation, minor defense-in-depth gap, missing optional manifest fields, cosmetic issues.

---

## Execution: parallel subagents

When the agent runtime supports delegation, split the audit across **4 subagents launched in parallel**. Each subagent is scoped to one concern and returns a structured list of findings. The main agent then dedupes, normalizes severities, and assembles the final report.

> If the current agent runtime does not support subagent dispatch (or the delegation tool is unavailable), fall back to running the four audits sequentially in the main thread. The audit must still complete — the parallelism is a performance optimization, not a hard requirement.

### Subagent 1 — Security
Scope: the entire module directory (`modules-core/[id]/**` or `modules-custom/[id]/**`) including `api/`, `components/`, `lib/`, `app/`, `hooks/`, `database/`, `module.json`, fixtures, and any docs. The hardcoded-credential scan in category 11 must cover **all file types**, not just TypeScript.
Runs Part A (Security Audit — 16 categories below). Returns findings as `{severity, file, line, category, issue, risk, recommendation}`.

> Context for Subagent 1: `getAuthenticatedUser()` now accepts **two** credentials — the Better Auth session cookie AND an `x-api-key` header (see `lib/auth-helpers.ts`, `lib/api-keys.ts`, `lib/auth-middleware.ts` `API_KEY_PREFIX`). The module dispatcher at `app/api/modules/[module]/[[...path]]/route.ts` already does a coarse "cookie or API key present" gate before invoking the handler, so the *only* check that matters in the module handler is `getAuthenticatedUser()` — do not separately flag a missing cookie check. Routes listed in `module.json` `publicRoutes` bypass the dispatcher gate entirely and must implement their own security per the rules below.

### Subagent 2 — Production-Readiness
Scope: the entire module folder plus the registration touchpoints listed in Part B.
Runs Part B (manifest, self-containment, install SQL, API patterns, OpenAPI annotations, public routes, registration, page hygiene, type safety).

### Subagent 3 — Database / Supabase / Postgres
Scope: `[module]/database/**`, any `[module]/database/migrations/**`, plus any Supabase usage in `[module]/api/**`.
This subagent must invoke the installed `supabase` and `supabase-postgres-best-practices` skills to evaluate the SQL/schema files and any Supabase calls. Findings include: missing indexes, unsafe RLS patterns, `auth.uid()` usage, suboptimal column types, inefficient queries, missing `security definer`, etc. Also runs the Part C destructive-SQL checks listed below.

### Subagent 4 — Frontend Quality
Scope: `[module]/hooks/**`, `[module]/components/**`, `[module]/app/**`, cross-referenced with `[module]/api/**/route.ts` for query pattern alignment. Must read `modules-core/module-template/hooks/use-module-template.ts` as the gold-standard reference for TanStack Query patterns.
Runs Part D (performance, data fetching, UX quality, accessibility). Returns findings as `{severity, file, line, category, issue, risk, recommendation}`.

### Merging
The main agent collects all four subagent results, removes duplicates (same file+line+category), normalizes severities to High/Medium/Low, and emits a single report in the format below.

---

## Part A — Security Audit

For every file under `[module]/api/**/*.ts`, `[module]/components/**`, and any server-side utilities, check for the following.

### 1. Authentication & Authorization
- [ ] Missing `getAuthenticatedUser()` call at start of route handler — **High**
- [ ] Missing 401 response when both `user` AND `withRLS` are not returned — **High**
- [ ] User ID taken from request body or query string instead of session/key — **High** (user impersonation)
- [ ] Missing `user_id` filter on SELECT/UPDATE/DELETE — relying solely on RLS — **High**. Per `docs/SECURITY.md`: the default Postgres role has `BYPASSRLS`, so explicit `where(eq(table.userId, user.id))` is **required**, not defense-in-depth.
- [ ] Routes that should be admin-only but accessible to all authenticated users — **High**
- [ ] Role/permission checks on the client only — **High**
- [ ] Hardcoded user IDs, roles, or tenant IDs — **Medium**
- [ ] Use of `supabase` client without a clear tenant/user boundary — **Medium**
- [ ] Handler logs or returns the `apiKey` metadata field returned by `getAuthenticatedUser()` (key id, IP) to the client — **Medium**. That field is meant for server-side audit logging only.

**Bad pattern:**
```typescript
// Missing auth check
export async function GET(request: NextRequest) {
  const { data } = await supabase.from("table").select("*")
  return NextResponse.json(data)
}

// User ID from request body
const { user_id, ...data } = await request.json()
await supabase.from("table").insert({ user_id, ...data })
```

### 2. Input Validation
- [ ] Missing Zod validation on POST/PUT/PATCH request bodies — **Medium**
- [ ] Manual ad-hoc validation instead of Zod — **Low**
- [ ] Missing UUID format validation on ID parameters — **Medium**
- [ ] Missing length limits on free-text fields (DoS via large payloads) — **Medium**
- [ ] Missing numeric range checks — **Low**
- [ ] Missing type validation on query parameters — **Medium**
- [ ] Mass assignment (accepting arbitrary fields without explicit schema) — **High**
- [ ] Client/server schemas drifting or inconsistent — **Low**

### 3. SQL Injection & Query Safety
- [ ] Raw SQL with string interpolation of user input — **High**
- [ ] User input in `.or()`, `.filter()`, `.textSearch()`, `.like()` without validation/whitelisting — **Medium**
- [ ] Dynamic table or column names from user input — **High**
- [ ] Missing parameterized queries in raw SQL — **High**
- [ ] Supabase RPC accepting unvalidated JSON — **Medium**

### 4. Service Role Key Exposure
- [ ] `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` in user-reachable API routes — **High**
- [ ] Admin client created with service role in client-accessible code — **High**
- [ ] Service key used where anon key would suffice — **Medium**
- [ ] Secret env vars referenced in code that could end up in the browser bundle — **High**

### 5. Sensitive Data Exposure
- [ ] Passwords, API keys, secrets in code, `module.json`, fixtures — **High**
- [ ] Full error stack traces returned to client — **Medium**
- [ ] Raw database errors thrown directly in responses — **Medium**
- [ ] Sensitive user data in responses unnecessarily (email, phone, tokens, internal IDs) — **Medium**
- [ ] `console.log` of secrets, tokens, or PII — **Medium**
- [ ] Internal IDs / implementation details in error messages — **Low**
- [ ] Configuration / env details returned to the client — **Medium**

### 6. Cross-Site Scripting (XSS)
- [ ] User input rendered without sanitization — **High**
- [ ] `dangerouslySetInnerHTML` without sanitization — **High**
- [ ] User-provided URLs in `href`/`src` without validation (`javascript:`, data URLs) — **High**
- [ ] Stored HTML/rich text without sanitization — **High**
- [ ] Markdown rendered without a safe renderer config — **Medium**
- [ ] Custom scripts / HTML widgets / embeds without strict filtering — **High**

### 7. CSRF, Cookies & Security Headers
- [ ] State-changing routes (POST/PUT/PATCH/DELETE) without CSRF protection — **Medium**
- [ ] Missing origin/`Referer` validation on sensitive routes — **Medium**
- [ ] Sensitive cookies missing `HttpOnly`/`Secure`/`SameSite` — **High**
- [ ] Tokens stored in `localStorage`/`sessionStorage` instead of secure cookies — **High**
- [ ] Missing security headers (CSP, X-Frame-Options) where the module controls them — **Low**

### 8. File Upload Security
- [ ] Missing file type validation (MIME + extension) — **High**
- [ ] Missing file size limits — **High**
- [ ] User-controlled file paths / folder names (path traversal) — **High**
- [ ] Uploads saved where they can be executed — **High**
- [ ] User uploads served from same domain without strict content-type controls — **Medium**
- [ ] No malware scanning for risky file types — **Low**

**ARI storage system patterns (when the module accepts uploads):**
- [ ] Uses `getStorageProvider(readStorageConfig())` from `@/lib/storage` — never writes to disk directly or constructs paths from user input — **High** if bypassed
- [ ] Uses `sanitizeFilename()` from `@/lib/storage` on the user-supplied filename before passing to the provider — **High** if absent
- [ ] Uses `validateStoredFilename()` when reading a stored filename back from a request (download/delete endpoints) — **High** if absent (path-traversal vector)
- [ ] Declares a stable `BUCKET` constant per module and validates `ALLOWED_TYPES` + `MAX_FILE_SIZE` server-side before writing — **High** if absent
- [ ] Does NOT read or trust `ARI_STORAGE_PROVIDER` to decide whether to skip validation — validation must run for every provider — **Medium**
- [ ] Reads provider-agnostic config via `readStorageConfig()` rather than env vars directly — **Low**

### 9. Rate Limiting & DoS
- [ ] No rate limiting on auth endpoints — **High**
- [ ] No rate limiting on expensive operations (reports, exports, complex queries) — **Medium**
- [ ] Missing pagination limits (unbounded `select("*")`) — **Medium**
- [ ] Endpoints accepting large request bodies without size limits — **Medium**
- [ ] Long-running operations in API routes without timeouts — **Low**

### 10. Insecure Dependencies & Supply Chain
- [ ] Known vulnerable packages — **High**
- [ ] Outdated dependencies with security patches available — **Medium**
- [ ] Unnecessary dependencies inflating attack surface — **Low**
- [ ] Unmaintained / abandoned libraries — **Medium**
- [ ] Packages running arbitrary code at install time — **Medium**

### 11. Configuration & Secrets (hardcoded credential scan — run explicitly)
Scan **every file** in the module — including `*.ts`, `*.tsx`, `*.js`, `*.json`, `*.sql`, `*.md`, `module.json`, fixtures, and any seed/sample data — for hardcoded secrets that should live in environment variables. This check must run on every audit; do not skip it.

- [ ] Hardcoded API keys, tokens, passwords, or client secrets anywhere in module files — **High**
- [ ] `NEXT_PUBLIC_*` used for values that should be server-only — **High**
- [ ] Secret-looking values committed to `module.json`, fixtures, or seed SQL — **High**
- [ ] Undocumented / unvalidated env vars — **Low**
- [ ] Internal configuration exposed via public endpoints — **Medium**
- [ ] Debug flags or unsafe test config left enabled — **Medium**

**Concrete patterns to grep for** (case-insensitive). Any match that is not clearly a placeholder, type definition, or `process.env.X` reference is **High**:

- Provider key prefixes: `sk-`, `sk-ant-`, `sk-proj-`, `pk_live_`, `pk_test_`, `rk_live_`, `xoxb-`, `xoxp-`, `ghp_`, `gho_`, `ghu_`, `ghs_`, `github_pat_`, `glpat-`, `AIza`, `ya29.`, `AKIA`, `ASIA`, `eyJhbGciOi` (JWT), `-----BEGIN .* PRIVATE KEY-----`
- Supabase / Postgres: `service_role`, `supabase.co` URLs combined with a literal key, `postgres://...:...@`, `postgresql://...:...@`
- Generic assignment patterns: `(api[_-]?key|secret|token|password|passwd|pwd|client[_-]?secret|access[_-]?token|auth[_-]?token|bearer)\s*[:=]\s*["'][^"']{12,}["']`
- Any string literal ≥ 32 chars of high-entropy base64/hex assigned to a variable named like a credential
- Bearer tokens hardcoded in `fetch`/`axios` headers instead of read from `process.env`

**Acceptable (not a finding)**:
- `process.env.FOO` references
- Placeholder strings like `"your-api-key-here"`, `"<REPLACE_ME>"`, `"xxx"` in docs/examples
- Test fixtures clearly marked as fake (but flag as **Low** if ambiguous)

Every confirmed hardcoded secret must appear in the report with file + line and the recommendation to move it to an env var (and rotate the leaked credential).

### 12. Cryptography & Password Handling
- [ ] Custom cryptography instead of standard libraries — **High**
- [ ] Plaintext passwords stored or logged — **High**
- [ ] Incorrect hashing (no salt, custom hash, obsolete algorithms) — **High**
- [ ] Encryption keys reused across unrelated purposes — **Medium**
- [ ] Tokens generated with predictable values instead of secure random — **High**

### 13. URL Handling, Redirects, SSRF & Public Routes
- [ ] Open redirects via user-controlled `redirect`/`next` params — **High**
- [ ] Server-side HTTP calls to user-supplied URLs without allowlists (SSRF) — **High**
- [ ] Webhook endpoints accepting unauthenticated POSTs without signature verification — **High**
- [ ] External integrations trusting incoming requests without verification — **High**

**Public routes (`module.json` `publicRoutes[]`):** these bypass the dispatcher's auth gate and must declare and enforce their own security.

- [ ] Every API path that exists under `[module]/api/**/route.ts` but skips `getAuthenticatedUser()` MUST be listed in `module.json` `publicRoutes[]` with a matching `path` + `methods` — **High** if missing (silent unauthenticated endpoint)
- [ ] Every `publicRoutes[]` entry has a `security` object with a recognized `type` — `webhook_signature` | `api_key` | `rate_limit_only` | `ip_allowlist` | `custom` — **High** if absent or unknown
- [ ] `webhook_signature` entries set `secretEnvVar` and the env var is read via `process.env.<NAME>` (not hardcoded) — **High**
- [ ] `api_key` entries set `apiKeyEnvVar` (and optionally `apiKeyHeader`); comparison is constant-time — **High**
- [ ] `ip_allowlist` entries list explicit IPs/CIDRs; the handler resolves the real client IP via `getClientIp()` from `@/lib/modules/public-route-security` (don't trust raw `request.ip`) — **High**
- [ ] `rate_limit_only` is justified in `customDescription` or `description` (it's the weakest type) — **Medium**
- [ ] `custom` entries include a `customDescription` documenting the validation approach — **Medium**
- [ ] Every public entry sets a sensible `rateLimit` (req/min). Missing or absurdly high (>1000) — **Medium**
- [ ] Signature validators use constant-time compare (`crypto.timingSafeEqual`) and reject stale timestamps (>5 min) for Stripe/Svix-style payloads — **High** if rolling your own without these
- [ ] Public route handlers still validate input with Zod before processing payload — **Medium**

### 14. Multi-tenancy & Data Segregation
- [ ] Queries that don't filter by tenant/user where they should — **High**
- [ ] Mixed-tenant data on the same screens or exports — **High**
- [ ] Global IDs / tables without tenant context — **Medium**
- [ ] Features that could access/modify cross-tenant data without strict checks — **High**
- [ ] Reliance only on client-provided tenant IDs — **High**

### 15. Logging, Audit & Observability
- [ ] No logging on security-relevant events (login, role changes, permission changes) — **Medium**
- [ ] Logging of sensitive data (passwords, secrets, full tokens) — **High**
- [ ] No correlation/request IDs where useful — **Low**
- [ ] Errors swallowed silently without logging — **Low**

### 16. Next.js Specific
- [ ] Server-only code or secrets imported into client components — **High**
- [ ] `fetch` in server code that might leak secrets via cache/logs — **Medium**
- [ ] Dynamic routes exposing internal IDs or unvalidated parameters — **Medium**
- [ ] `revalidate`/caching that might expose private data to other users — **High**
- [ ] Middleware that modifies auth/cookies in unexpected ways — **High**

---

## Part B — Production-Readiness Audit

### B1. Module manifest (`module.json`)
- [ ] File exists and parses as valid JSON — **High** if missing
- [ ] `id` matches the folder name and is kebab-case — **High** if mismatched
- [ ] Required fields present: `id`, `name`, `description`, `version`, `icon`, `enabled`, `routes` — **Medium**
- [ ] Optional fields like `author`, `group`, `menuPriority`, `fullscreen` populated — **Low**
- [ ] `description` ≤ 200 chars — **Low**
- [ ] `database.tables[]` matches the tables actually created in `database/schema.sql` — **Medium**. `lib/modules/module-registry.ts` warns when `tables[]` is declared but `schema.sql` is missing; missing tables won't be auto-provisioned.
- [ ] If `database/schema.sql` exists, `schemaSha256` is present (auto-populated by `scripts/generate-module-registry.js`; missing usually means the generator was never re-run after editing schema.sql) — **Low**
- [ ] `npmDependencies` (if present) is a flat `{ name: version }` map with ≤ 25 entries — **Medium**
- [ ] No npm spec contains `git:`, `http:`, `https:`, `file:`, `link:`, `workspace:`, `npm:`, or `..` (installer rejects these at install time per `lib/modules/npm-installer.ts`) — **High**
- [ ] No npm package would conflict with the host's root `package.json` at an incompatible range (framework deps like `react`, `next`, `drizzle-orm`, `better-auth` are the common conflict points) — **High**
- [ ] `topBarIcon` / `submenu` / `dashboard` / `settings` paths point to files that actually exist — **Medium**

### B2. Self-containment (user-emphasized)
- [ ] All source files for the module live under `modules-core/[id]/` or `modules-custom/[id]/`. Search for the module id in `lib/hooks/`, `lib/utils/`, `components/`, `app/` (excluding the auto-generated registries in `lib/generated/` and the API proxy at `app/api/modules/[module]/[[...path]]/route.ts`). Any hit is **High**.
- [ ] All TanStack Query hooks live in `[module]/hooks/`, never in `/lib/hooks/` — **High**
- [ ] Internal imports use the `@/modules/...` alias rather than relative paths into other modules — **Medium**
- [ ] No imports reaching into a sibling module's internals — **High**

### B3. Install-time SQL (user-emphasized)

**Required database files.** Every module that owns tables must ship all three of these files inside `[module]/database/`:
- [ ] `database/schema.sql` — the canonical CREATE TABLE / CREATE INDEX / RLS policy script that the module loader runs at install time. **High** if missing.
- [ ] `database/schema.ts` — the Drizzle ORM table definitions used by API routes via `withRLS()`. **High** if missing.
- [ ] `database/uninstall.sql` — a manual-only teardown script (DROP TABLE statements). This file is **never executed automatically**; it exists only so a user can manually run it from their SQL client of choice (Supabase Studio, pgweb, or `psql`) if they want to fully remove the module's tables. **Medium** if missing.

**Install SQL must run every time the module is enabled.** The module loader is expected to execute `schema.sql` on every enable (not just first install), so the script must be fully idempotent. Verify by reading `lib/modules/module-loader.ts`:
- [ ] Confirm `schema.sql` is executed on enable, not gated behind a "first install only" check. **High** if not executed on enable.
- [ ] Every `CREATE TABLE` uses `IF NOT EXISTS` so re-running the script on an already-installed module is a no-op. **High** if any CREATE TABLE is non-idempotent.
- [ ] Every `CREATE INDEX` uses `IF NOT EXISTS`. **Medium** if missing.
- [ ] Every `CREATE POLICY` is wrapped in `DROP POLICY IF EXISTS ...; CREATE POLICY ...` (or equivalent) so re-runs don't fail on duplicate policies. **Medium** if missing.

**Install SQL must never be destructive.** The install script (`schema.sql`) and any other `.sql` file the module loader executes must NOT contain anything that can destroy user data. The runtime installer at `lib/modules/schema-installer.ts` will *refuse* to execute the file if it sees any of these (the regex scan strips SQL comments first, so wrapping a forbidden statement in `--` won't sneak it past — and won't help an audit either):
- [ ] **No `DROP TABLE`, `DROP SCHEMA`, `DROP DATABASE`, or `TRUNCATE`** anywhere in `schema.sql` or any auto-loaded SQL file. **High** — installer rejects and the module fails to enable. (`DROP INDEX`, `DROP POLICY`, `DROP TRIGGER` are allowed; they're needed for re-runnable schema.)
- [ ] **No `DELETE FROM ...` without a `WHERE` clause** in any auto-loaded SQL file. **High** — installer rejects.
- [ ] **No `ALTER TABLE ... DROP COLUMN`** in `schema.sql`. **High** — installer rejects.

**`uninstall.sql` is manual-only.** This file is allowed (and expected) to contain `DROP TABLE` statements, but it must never be wired into the module loader, an enable hook, a disable hook, or any API route:
- [ ] Confirm `uninstall.sql` is NOT referenced from `lib/modules/module-loader.ts`, `module.json`, or any code path that runs on enable/disable. **High** if it is auto-executed anywhere.
- [ ] The file should be clearly labeled at the top as a manual-only teardown script (comment block explaining the user must run it themselves in their SQL client — Supabase Studio, pgweb, or `psql`). **Low** if the warning comment is missing.
- [ ] All `CREATE INDEX` statements use `IF NOT EXISTS` — **Low**
- [ ] Every table has `user_id TEXT NOT NULL` in `schema.sql` — **High**. Must be `TEXT`, **not** `UUID`. Better Auth stores user IDs as text (see `core-schema.ts`: `session.userId`, `account.userId`, `moduleSettings.userId`, `userPreferences.userId` are all `text()`). Using `UUID` causes a type mismatch with `current_setting('app.current_user_id')` and with `user.id` returned by `getAuthenticatedUser()`.
- [ ] Every table has `userId: text("user_id").notNull()` in `schema.ts` (Drizzle) — **High**. Must be `text()`, **not** `uuid()`, for the same reason above. A `uuid("user_id")` column will silently accept inserts but may cause cast errors or comparison failures with the text-typed user ID from Better Auth.
- [ ] Every table has `created_at` and `updated_at` (TIMESTAMPTZ) — **Low**
- [ ] Every table has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` — **High**
- [ ] Every table has SELECT/INSERT/UPDATE/DELETE policies referencing `current_setting('app.current_user_id')` — **High**
- [ ] No `auth.uid()` references (Better Auth incompatibility) — **High**
- [ ] Indexes exist on `user_id` and frequently filtered columns — **Medium**

### B4. API security & patterns
For every `[module]/api/**/route.ts` (skip routes listed in `module.json` `publicRoutes[]` — those are governed by Part A §13):
- [ ] Imports `getAuthenticatedUser` from `@/lib/auth-helpers` — **High**
- [ ] Every exported handler (`GET`/`POST`/`PUT`/`DELETE`/`PATCH`) calls `getAuthenticatedUser()` and returns 401 when `user` OR `withRLS` is missing **before any DB access** — **High**
- [ ] Handler does not read `session.*` fields directly — use `user.*` instead. When the caller authenticated via `x-api-key`, `session` is `null` (see `lib/auth-helpers.ts`), so any `session.user.email` / `session.access_token` dereference crashes the route for API-key callers — **Medium**
- [ ] All DB operations use `withRLS((db) => ...)`. Any direct use of the legacy `supabase` client is **Medium**
- [ ] SELECT/UPDATE/DELETE queries include `.where(eq(table.userId, user.id))` (or `and(...)` with the resource id) — **High**. Per `docs/SECURITY.md`: the default Postgres role has `BYPASSRLS`, so explicit filters are **mandatory**, not defense-in-depth.
- [ ] Inserts explicitly set `userId: user.id` (Drizzle camelCase) — **High**
- [ ] Request bodies validated via `validateRequestBody` from `lib/api-helpers.ts` **OR** `Schema.safeParse()` — **Medium**
- [ ] Path/query params validated via `validatePathParams` / `validateQueryParams` — **Medium**
- [ ] User-rendered text fields validated with `safeText(max)` from `@/lib/validation` (rejects `<`, `>`, control chars) — **Medium** for fields that round-trip to HTML/UI
- [ ] Error responses use `createErrorResponse()` from `@/lib/api-helpers` OR wrap the catch-block message with `safeErrorResponse()` from `@/lib/api-error` (production-safe) — **Medium**
- [ ] No `console.log` / response body leaks stack traces, raw SQL errors, secrets, or PII — **Medium**
- [ ] No `process.env.SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` usage in module code — **High**
- [ ] API responses wrap Drizzle output with `toSnakeCase()` from `@/lib/api-helpers` (Drizzle returns camelCase; frontend expects snake_case) — **Medium**
- [ ] No manual field mapping where `toSnakeCase()` would suffice (e.g. `{ content: data[0].content, updated_at: data[0].updatedAt }`) — **Low**
- [ ] POST handlers return `{ status: 201 }` for resource creation, not 200 — **Low**
- [ ] Specific-resource endpoints return 404 when the resource is not found (not an empty array or silent 200) — **Low**

### B5. OpenAPI annotations (required for every route)
Every authenticated **and** public route must register with the shared OpenAPI registry so it surfaces in `/api-docs`, `/settings?tab=api`, and `/health` → Endpoints. Missing annotations don't break the route, but they make it invisible to every diagnostic in ARI. See `docs/MODULES.md` §7.6 and `modules-core/module-template/api/data/route.ts` for the canonical pattern.

- [ ] All Zod schemas live in `[module]/lib/validation.ts`, NOT inline in `route.ts` — **Low**
- [ ] `[module]/lib/validation.ts` imports `'@/lib/openapi/registry'` as a side-effect (extends Zod with `.openapi()`) — **Medium** if missing (every schema name silently disappears from the spec)
- [ ] Every schema is tagged `.openapi('SchemaName')` and the name is prefixed with the module slug for uniqueness — **Medium**
- [ ] Every handler verb (`GET`/`POST`/`PUT`/`DELETE`/`PATCH`) has a preceding `registry.registerPath({ ... })` call — **Medium** if missing
- [ ] `tags: ['<module-id>']` matches the module's folder slug (anything not in `NON_MODULE_TAGS` is treated as a module id by the spec consumers) — **Low**
- [ ] `security: DEFAULT_SECURITY` is set on authenticated routes; omitted or `[]` only on `publicRoutes` — **Medium**
- [ ] Error responses reference shared `ErrorResponseSchema` / `InternalServerErrorResponse` from `@/lib/openapi/common` (not redeclared per module) — **Low**
- [ ] `operationId` is globally unique across the spec — prefix with module slug (e.g. `listMyModuleEntries`) — **Medium**
- [ ] Spec rebuilds clean: `pnpm dev` or `pnpm build` ran the `predev` / `prebuild` `scripts/generate-openapi.ts` without logging failures for this module — **Low**

### B6. Registration completeness
- [ ] Module id appears in `lib/generated/module-pages-registry.ts` (`REGISTERED_MODULE_IDS`) — **Medium**
- [ ] If the module has `api/`: a corresponding entry exists in the auto-generated `lib/generated/module-api-registry.ts` `MODULE_API_ROUTES` — **High**
- [ ] If the module has `database/schema.ts`: re-exported by the auto-generated barrel `lib/db/schema/schema.ts` — **Medium**
- [ ] If `database/relations.ts` exists, it references only this module's tables (cross-module relations cause the generator to skip the file with a warning when the other module isn't installed — the relations end up unavailable at runtime even though the build succeeds) — **Medium**
- [ ] If the module has `database/schema.sql`: registered in `lib/generated/module-schemas.ts` (bundled SQL map used at install time on Vercel) — **Medium**
- [ ] If the module declares dashboard widgets / submenus / topBarIcon: corresponding registry entries exist — **Medium**
- [ ] If the module has `publicRoutes`: each entry is reflected in `lib/generated/module-manifest.json` `publicRoutes` (the dispatcher reads from this file, not `module.json` directly) — **High** if drifted (route silently requires auth at runtime)

### B7. Page component hygiene
- [ ] `app/page.tsx` exists for any route with a non-`hidden` sidebar position — **Medium**
- [ ] Has `'use client'` directive where appropriate — **Low**
- [ ] Does NOT render `SidebarProvider`, `AppSidebar`, `SidebarInset`, `DarkModeProvider`, or `TaskAnnouncement` (all provided by router wrapper) — **Medium**
- [ ] Uses TanStack Query hooks (not raw `useState` + `fetch`) — **Low**

### B8. Type safety
- [ ] `types/index.ts` exists if the module has shared types — **Low**
- [ ] No `any` types in API route handlers — **Low**

---

## Part C — Supabase / Postgres Best Practices

This part is run by Subagent 3 by **invoking the installed skills**:
- `supabase` — for Supabase client usage, auth patterns, RLS correctness, edge functions, realtime, storage.
- `supabase-postgres-best-practices` — for query performance, indexing, schema design, column types, RLS efficiency.

The subagent should:
1. Read all files under `[module]/database/` (`schema.sql`, `schema.ts`, any `migrations/`).
2. Read any Supabase usage in `[module]/api/**`.
3. Invoke each skill against this context and collect their findings.
4. Map each finding into High/Medium/Low using the severity model above (use the skill's own severity hint as a starting point, then adjust).
5. Return findings in the same `{severity, file, line, category, issue, recommendation}` shape as the other subagents.

If either skill is unavailable in the current environment, skip it and note it under "Skipped checks" in the final report.

---

## Part D — Frontend Quality Audit

This part is run by Subagent 4. Before auditing, read `modules-core/module-template/hooks/use-module-template.ts` as the gold-standard reference for TanStack Query patterns (query key constants, optimistic updates, rollback, invalidation).

### D1. Performance
- [ ] API route GET handlers for list endpoints return unbounded query results (SELECT without `.limit()`) — **Medium**
- [ ] API route GET handlers for list endpoints missing pagination support (no `limit`/`offset` query params) — **Medium**
- [ ] N+1 query patterns: sequential DB queries in a loop that could use `inArray()` or a single joined query — **Medium**
- [ ] N+1 fetch patterns in client hooks: loop of individual `fetch()` calls that could be a single batch API call — **Low**
- [ ] Wildcard icon imports (`import * as Icons from 'lucide-react'`) or importing the entire icon library instead of individual icons — **Medium**
- [ ] Heavy synchronous imports (chart libraries, rich text editors, large dependencies) that could use `next/dynamic` or `React.lazy()` — **Low**

### D2. TanStack Query / Data Fetching Patterns
- [ ] Module has API routes but no `hooks/` directory with TanStack Query hooks — **Medium**
- [ ] Components using raw `useState` + `useEffect` + `fetch()` for data that should use `useQuery` — **Medium**
- [ ] Mutations missing the `onMutate` (optimistic) + `onError` (rollback) + `onSettled` (invalidate) pattern — **Low** (some mutations like settings saves legitimately don't need optimistic updates)
- [ ] Query keys defined as inline strings (e.g. `['tasks']`) instead of constants at module level — **Low**
- [ ] Direct `fetch()` calls in page/component files instead of going through hooks — **Medium**
- [ ] Manual `Authorization` header in fetch calls — **Medium** (Better Auth sends cookies automatically; manual headers indicate pre-migration code)
- [ ] Missing cache invalidation after mutations (no `invalidateQueries` call in `onSettled`) — **Medium**

### D3. UX Quality
- [ ] Main page component has no loading state (no `isLoading` check with spinner or skeleton) — **Medium**
- [ ] Main page component has no empty state (no message or CTA when data array is empty) — **Low**
- [ ] Main page component has no error state (no fallback display when data fetch fails) — **Medium**
- [ ] Mutation buttons not disabled while `isPending` (double-submit risk, can create duplicate records) — **Medium**
- [ ] Delete actions without confirmation dialog — **Low**
- [ ] Missing toast notifications on mutation errors (user doesn't know why action failed) — **Low**
- [ ] Dashboard widgets not handling all three states: loading, error, success — **Low**

### D4. Accessibility (lightweight)
- [ ] Interactive elements (buttons, links, icon-only controls) missing accessible labels (`aria-label`, visible text, or `sr-only` text) — **Low**
- [ ] Form inputs not associated with `<Label>` elements (missing `htmlFor` or wrapping) — **Low**
- [ ] Images or icons used as sole content without `alt` text or `aria-hidden` — **Low**
- [ ] Custom modal/dialog components missing focus trap or return-focus behavior (does not apply to shadcn `Dialog`, which handles this automatically) — **Low**
- [ ] Color-only status indicators without a text or icon alternative — **Low**

---

## Output format

Output a single Markdown report for the audited module. Group findings by severity (High → Medium → Low). Each finding cites file + line, category, issue, and recommendation.

Category tags: `[Security]` (Part A), `[Readiness]` (Part B), `[OpenAPI]` (Part B5), `[Database]` (Part C), `[Performance]` (Part D1), `[Data Fetching]` (Part D2), `[UX]` (Part D3), `[Accessibility]` (Part D4).

```md
# Module Audit Report — <module-name> (`modules-core/<module-id>`)

## High
### [Security] Missing auth check on POST handler
- **Location**: `modules-core/<id>/api/items/route.ts:42`
- **Issue**: POST handler does not call `getAuthenticatedUser()` before inserting.
- **Risk**: Unauthenticated users can insert rows; user_id is taken from request body.
- **Recommendation**: Call `getAuthenticatedUser()` first; reject with 401 if missing; set `user_id: user.id` from session.

### [Readiness] DROP TABLE in install SQL
- **Location**: `modules-core/<id>/database/schema.sql:88`
- **Issue**: `DROP TABLE foo CASCADE;` present in install script.
- **Risk**: Reinstalling the module would destroy existing user data.
- **Recommendation**: Remove the DROP. Use `CREATE TABLE IF NOT EXISTS`. If a destructive migration is genuinely needed, ship it as a separate, opt-in migration script.

## Medium
### [Database] Missing index on frequently filtered column
- **Location**: `modules-core/<id>/database/schema.sql:34`
- **Issue**: `status` column is filtered in API queries but has no index.
- **Recommendation**: `CREATE INDEX IF NOT EXISTS idx_<table>_status ON <table>(status);`

### [Performance] Unbounded query on list endpoint
- **Location**: `modules-core/<id>/api/data/route.ts:18`
- **Issue**: GET handler returns all rows without `.limit()` or pagination params.
- **Recommendation**: Add `limit`/`offset` query params with a sensible default (e.g. 100).

### [Data Fetching] Raw fetch instead of TanStack Query hooks
- **Location**: `modules-core/<id>/app/page.tsx:25`
- **Issue**: Component uses `useState` + `useEffect` + `fetch()` instead of `useQuery`.
- **Recommendation**: Create a hook in `hooks/use-<module>.ts` using `useQuery`. See `modules-core/module-template/hooks/use-module-template.ts`.

## Low
### [Readiness] Optional manifest field missing
- **Location**: `modules-core/<id>/module.json`
- **Issue**: `author` field not set.
- **Recommendation**: Add `"author": "..."`.

### [UX] No empty state
- **Location**: `modules-core/<id>/app/page.tsx`
- **Issue**: No message or CTA displayed when the data array is empty.
- **Recommendation**: Add an empty state with a prompt to create the first entry.
```

After the findings, append a one-line summary and a top-5 priority list:

```md
---

**Summary**: <module-id> — <H> High, <M> Medium, <L> Low

**Top 5 priorities**
1. [High] api/items/route.ts:42 — Missing auth check on POST handler
2. [High] database/schema.sql:88 — DROP TABLE in install SQL
3. ...
```

If a subagent's checks were skipped (e.g. a skill was unavailable), list them under a final `## Skipped checks` section so the user knows what wasn't covered.

---

## Critical files to read

When auditing, the subagents should be aware of these reference files:
- `.claude/commands/ari-create-module.md` — source of truth for module creation rules
- `docs/MODULES.md` — full module system reference (§7.5 public routes, §7.6 OpenAPI + API keys)
- `docs/SECURITY.md` — layered security model; explains why `BYPASSRLS` makes explicit `user_id` filters mandatory
- `lib/auth-helpers.ts` — `getAuthenticatedUser` (resolves session cookie OR `x-api-key`), `withRLS` helper, `requireAuthIfUsersExist`
- `lib/auth-middleware.ts` — `BETTER_AUTH_COOKIE_NAME`, `API_KEY_PREFIX`, `hasSessionCookie`, `hasApiKeyHeader`
- `lib/api-keys.ts` — `hashApiKey`, `lookupApiKey`, `checkIpAllowed`, `recordApiKeyUsage`
- `lib/api-helpers.ts` — `validateRequestBody`, `validatePathParams`, `validateQueryParams`, `createErrorResponse`, `toSnakeCase`
- `lib/api-error.ts` — `safeErrorResponse` (production-safe error message helper)
- `lib/validation.ts` — `safeText(max)` XSS-safe text validator; shared welcome/profile schemas
- `lib/modules/schema-installer.ts` — refuses `DROP TABLE` / `TRUNCATE` / `DELETE without WHERE` / `ALTER TABLE … DROP COLUMN` in schema.sql at install time
- `lib/modules/public-route-security.ts` — `checkRateLimit`, `isSameOriginRequest`, `getClientIp`, Svix/Stripe/GitHub signature validators
- `lib/modules/npm-installer.ts` — npm dependency installer; rejects forbidden version specifiers
- `lib/modules/module-types.ts` — `ModuleManifest`, `PublicRouteConfig`, `PublicRouteSecurity` type definitions
- `lib/openapi/registry.ts` — singleton `OpenAPIRegistry`; extends Zod with `.openapi()` as a side effect
- `lib/openapi/common.ts` — `DEFAULT_SECURITY`, `ErrorResponseSchema`, `UnauthorizedResponse`, `InternalServerErrorResponse`
- `lib/openapi/types.ts` — `NON_MODULE_TAGS`, `X_ARI` extension keys
- `lib/storage/index.ts` + `lib/storage/sanitize.ts` — `getStorageProvider`, `readStorageConfig`, `sanitizeFilename`, `validateStoredFilename`
- `lib/generated/module-pages-registry.ts` — page registration
- `lib/generated/module-api-registry.ts` — API route registration (auto-generated; reflects what the dispatcher can dispatch)
- `lib/generated/module-manifest.json` — bundled manifest read by the dispatcher to identify `publicRoutes`
- `lib/generated/module-schemas.ts` — bundled schema.sql map used at install time on Vercel
- `app/api/modules/[module]/[[...path]]/route.ts` — dispatcher; does the coarse auth gate + API-key usage logging
- `lib/db/schema/schema.ts` — Drizzle schema barrel
- `lib/db/schema/core-schema.ts` — Better Auth tables and system tables; source of truth that `user.id` is `text`, so all module `user_id` columns must also be `text`, not `uuid`
- `modules-core/module-template/api/data/route.ts` — gold-standard route: OpenAPI annotations, validation, RLS, `toSnakeCase`
- `modules-core/module-template/api/upload/route.ts` — gold-standard upload route using ARI storage system
- `modules-core/module-template/lib/validation.ts` — gold-standard Zod schemas tagged with `.openapi()`
- `modules-core/module-template/hooks/use-module-template.ts` — gold-standard TanStack Query patterns (query key constants, optimistic updates, rollback, cache invalidation)
- `modules-core/module-template/components/settings-panel.tsx` — gold-standard UX patterns (loading states, `isPending` guards, toast usage)
- A reference module like `modules-core/tasks/` for the gold-standard structure

---

## Disclaimer

**IMPORTANT**: This is an automated, best-effort static audit. It does **not** replace a professional security review or runtime testing.

**Limitations**:
- Cannot detect all logical or business-logic vulnerabilities
- May produce false positives or miss context-dependent issues
- Does not execute SQL or test runtime behavior
- Cannot verify live RLS policies or database/cloud configuration
- Does not exhaustively scan third-party dependencies
- Does not review deployment, network security groups, or WAF rules

**It is the developer's responsibility to thoroughly review all code and follow best practices.**
