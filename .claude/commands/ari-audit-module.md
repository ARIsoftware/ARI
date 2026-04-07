# ARI Module Audit (`/ari-audit-module`)

Audit a single ARI module for **security vulnerabilities**, **production-readiness**, and **Supabase / Postgres best practices**. Produces one consolidated report with findings grouped by **High / Medium / Low** severity.

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

When the agent runtime supports delegation, split the audit across **3 subagents launched in parallel**. Each subagent is scoped to one concern and returns a structured list of findings. The main agent then dedupes, normalizes severities, and assembles the final report.

> If the current agent runtime does not support subagent dispatch (or the delegation tool is unavailable), fall back to running the three audits sequentially in the main thread. The audit must still complete — the parallelism is a performance optimization, not a hard requirement.

### Subagent 1 — Security
Scope: the entire module directory (`modules-core/[id]/**` or `modules-custom/[id]/**`) including `api/`, `components/`, `lib/`, `app/`, `hooks/`, `database/`, `module.json`, fixtures, and any docs. The hardcoded-credential scan in category 11 must cover **all file types**, not just TypeScript.
Runs Part A (Security Audit — 16 categories below). Returns findings as `{severity, file, line, category, issue, risk, recommendation}`.

### Subagent 2 — Production-Readiness
Scope: the entire module folder plus the registration touchpoints listed in Part B.
Runs Part B (manifest, self-containment, install SQL, registration, page hygiene, type safety).

### Subagent 3 — Database / Supabase / Postgres
Scope: `[module]/database/**`, any `[module]/database/migrations/**`, plus any Supabase usage in `[module]/api/**`.
This subagent must invoke the installed `supabase` and `supabase-postgres-best-practices` skills to evaluate the SQL/schema files and any Supabase calls. Findings include: missing indexes, unsafe RLS patterns, `auth.uid()` usage, suboptimal column types, inefficient queries, missing `security definer`, etc. Also runs the Part C destructive-SQL checks listed below.

### Merging
The main agent collects all three subagent results, removes duplicates (same file+line+category), normalizes severities to High/Medium/Low, and emits a single report in the format below.

---

## Part A — Security Audit

For every file under `[module]/api/**/*.ts`, `[module]/components/**`, and any server-side utilities, check for the following.

### 1. Authentication & Authorization
- [ ] Missing `getAuthenticatedUser()` call at start of route handler — **High**
- [ ] Missing 401 response when user is not authenticated — **High**
- [ ] User ID taken from request body or query string instead of session — **High** (user impersonation)
- [ ] Missing `user_id` filter in DB queries where required (relying solely on RLS) — **Medium**
- [ ] Routes that should be admin-only but accessible to all authenticated users — **High**
- [ ] Role/permission checks on the client only — **High**
- [ ] Hardcoded user IDs, roles, or tenant IDs — **Medium**
- [ ] Use of `supabase` client without a clear tenant/user boundary — **Medium**

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

### 13. URL Handling, Redirects & SSRF
- [ ] Open redirects via user-controlled `redirect`/`next` params — **High**
- [ ] Server-side HTTP calls to user-supplied URLs without allowlists (SSRF) — **High**
- [ ] Webhook endpoints accepting unauthenticated POSTs without signature verification — **High**
- [ ] External integrations trusting incoming requests without verification — **High**

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
- [ ] Optional fields like `author`, `group` populated — **Low**

### B2. Self-containment (user-emphasized)
- [ ] All source files for the module live under `modules-core/[id]/` or `modules-custom/[id]/`. Search for the module id in `lib/hooks/`, `lib/utils/`, `components/`, `app/` (excluding the auto-generated registries in `lib/generated/` and the API proxy at `app/api/modules/[module]/[[...path]]/route.ts`). Any hit is **High**.
- [ ] All TanStack Query hooks live in `[module]/hooks/`, never in `/lib/hooks/` — **High**
- [ ] Internal imports use the `@/modules/...` alias rather than relative paths into other modules — **Medium**
- [ ] No imports reaching into a sibling module's internals — **High**

### B3. Install-time SQL (user-emphasized)

**Required database files.** Every module that owns tables must ship all three of these files inside `[module]/database/`:
- [ ] `database/schema.sql` — the canonical CREATE TABLE / CREATE INDEX / RLS policy script that the module loader runs at install time. **High** if missing.
- [ ] `database/schema.ts` — the Drizzle ORM table definitions used by API routes via `withRLS()`. **High** if missing.
- [ ] `database/uninstall.sql` — a manual-only teardown script (DROP TABLE statements). This file is **never executed automatically**; it exists only so a user can manually run it from the Supabase SQL editor if they want to fully remove the module's tables. **Medium** if missing.

**Install SQL must run every time the module is enabled.** The module loader is expected to execute `schema.sql` on every enable (not just first install), so the script must be fully idempotent. Verify by reading `lib/modules/module-loader.ts`:
- [ ] Confirm `schema.sql` is executed on enable, not gated behind a "first install only" check. **High** if not executed on enable.
- [ ] Every `CREATE TABLE` uses `IF NOT EXISTS` so re-running the script on an already-installed module is a no-op. **High** if any CREATE TABLE is non-idempotent.
- [ ] Every `CREATE INDEX` uses `IF NOT EXISTS`. **Medium** if missing.
- [ ] Every `CREATE POLICY` is wrapped in `DROP POLICY IF EXISTS ...; CREATE POLICY ...` (or equivalent) so re-runs don't fail on duplicate policies. **Medium** if missing.

**Install SQL must never be destructive.** The install script (`schema.sql`) and any other `.sql` file the module loader executes must NOT contain anything that can destroy user data:
- [ ] **No `DROP TABLE`, `DROP SCHEMA`, `DROP DATABASE`, `DROP INDEX`, or `TRUNCATE`** anywhere in `schema.sql` or any auto-loaded SQL file. **High** — re-enabling the module would wipe user data.
- [ ] **No `DELETE FROM ...` without a `WHERE` clause** in any auto-loaded SQL file. **High**.
- [ ] **No `ALTER TABLE ... DROP COLUMN`** in `schema.sql`. **High** — would silently lose user data on every enable.

**`uninstall.sql` is manual-only.** This file is allowed (and expected) to contain `DROP TABLE` statements, but it must never be wired into the module loader, an enable hook, a disable hook, or any API route:
- [ ] Confirm `uninstall.sql` is NOT referenced from `lib/modules/module-loader.ts`, `module.json`, or any code path that runs on enable/disable. **High** if it is auto-executed anywhere.
- [ ] The file should be clearly labeled at the top as a manual-only teardown script (comment block explaining the user must run it themselves in the Supabase SQL editor). **Low** if the warning comment is missing.
- [ ] All `CREATE INDEX` statements use `IF NOT EXISTS` — **Low**
- [ ] Every table has `user_id TEXT NOT NULL` — **High**
- [ ] Every table has `created_at` and `updated_at` (TIMESTAMPTZ) — **Low**
- [ ] Every table has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` — **High**
- [ ] Every table has SELECT/INSERT/UPDATE/DELETE policies referencing `current_setting('app.current_user_id')` — **High**
- [ ] No `auth.uid()` references (Better Auth incompatibility) — **High**
- [ ] Indexes exist on `user_id` and frequently filtered columns — **Medium**

### B4. API security & patterns
For every `[module]/api/**/route.ts`:
- [ ] Imports `getAuthenticatedUser` from `@/lib/auth-helpers` — **High**
- [ ] Every exported handler (`GET`/`POST`/`PUT`/`DELETE`/`PATCH`) calls `getAuthenticatedUser()` and returns 401 when `user`/`withRLS` are missing **before any DB access** — **High**
- [ ] All DB operations use `withRLS((db) => ...)`. Any direct use of the legacy `supabase` client is **Medium**
- [ ] Inserts explicitly set `user_id: user.id` — **High**
- [ ] Request bodies validated via `validateRequestBody` from `lib/api-helpers.ts` — **Medium**
- [ ] Error responses use `createErrorResponse` and don't leak stack traces, raw SQL errors, or PII — **Medium**
- [ ] No `process.env.SUPABASE_SERVICE_ROLE_KEY` usage in module code — **High**
- [ ] Public/webhook routes (if any) require a secret check — **High**

### B5. Registration completeness
- [ ] Module id appears in `lib/generated/module-pages-registry.ts` (`REGISTERED_MODULE_IDS`) — **Medium**
- [ ] If the module has `api/`: a corresponding entry exists in `app/api/modules/[module]/[[...path]]/route.ts` `MODULE_API_ROUTES` — **High**
- [ ] If the module has `database/schema.ts`: re-exported in `lib/db/schema/schema.ts` (auto-generated barrel) — **Medium**
- [ ] If the module declares dashboard widgets / submenus / topBarIcon: corresponding registry entries exist — **Medium**

### B6. Page component hygiene
- [ ] `app/page.tsx` exists for any route with a non-`hidden` sidebar position — **Medium**
- [ ] Has `'use client'` directive where appropriate — **Low**
- [ ] Does NOT render `SidebarProvider`, `AppSidebar`, or `SidebarInset` (provided by router) — **Medium**
- [ ] Uses TanStack Query hooks (not raw `useState` + `fetch`) — **Low**

### B7. Type safety
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

## Output format

Output a single Markdown report for the audited module. Group findings by severity (High → Medium → Low). Each finding cites file + line, category, issue, and recommendation.

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

## Low
### [Readiness] Optional manifest field missing
- **Location**: `modules-core/<id>/module.json`
- **Issue**: `author` field not set.
- **Recommendation**: Add `"author": "..."`.
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
- `.claude/commands/ari-create-module.md` — source of truth for module rules
- `lib/auth-helpers.ts` — `getAuthenticatedUser`, `withRLS` helper
- `lib/api-helpers.ts` — `validateRequestBody`, `createErrorResponse`, `toSnakeCase`
- `lib/modules/module-loader.ts` — install-time SQL behavior
- `lib/generated/module-pages-registry.ts` — page registration
- `app/api/modules/[module]/[[...path]]/route.ts` — API registration
- `lib/db/schema/schema.ts` — Drizzle schema barrel
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
