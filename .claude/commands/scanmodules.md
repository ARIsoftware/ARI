# Security Audit Command for ARI Modules

Perform a comprehensive security audit of all modules in `/modules-core` and `/modules-custom` directories.

This is a **static code review** checklist for modules. It does not replace penetration testing or runtime monitoring.

---

## Instructions

Scan each module directory and check for the following security vulnerabilities. For each module, report findings with severity ratings.
Important: Do not change any code or attempt to fix any issue unless explicitly instructed by the user to do so.

### Severity Levels
- **CRITICAL**: Immediate exploitation risk, data breach potential, authentication bypass, remote code execution
- **HIGH**: Significant security flaw that could lead to data exposure, unauthorized access, privilege escalation or data corruption
- **MEDIUM**: Security weakness that could be exploited under certain conditions or that significantly weakens defense in depth
- **LOW**: Minor security concern, best practice violation or small defense in depth gap

---

## Security Checks to Perform

### 1. Authentication & Authorization

**Check all API routes (`/api/**/*.ts`) and server actions for:**

- [ ] Missing `getAuthenticatedUser()` call at start of route handler
- [ ] Missing 401 response when user is not authenticated
- [ ] User ID taken from request body or query string instead of session (CRITICAL - user impersonation)
- [ ] Missing `user_id` filter in database queries where required for isolation (relying solely on RLS)
- [ ] Routes that should be admin only but are accessible to all authenticated users
- [ ] Role or permission checks implemented client side only (CRITICAL if not enforced on server)
- [ ] Hardcoded user IDs, roles or tenant IDs
- [ ] Any use of `supabase` client without a clear tenant and user boundary

**Example vulnerable pattern:**
```typescript
// BAD - Missing auth check
export async function GET(request: NextRequest) {
  const { data } = await supabase.from("table").select("*")
  return NextResponse.json(data)
}

// BAD - User ID from request body
const { user_id, ...data } = await request.json()
await supabase.from("table").insert({ user_id, ...data })
```

---

### 2. Input Validation

**Check for:**

- [ ] Missing Zod schema validation on POST, PUT, PATCH request bodies
- [ ] Manual ad hoc validation instead of Zod or a shared schema library
- [ ] Missing UUID format validation on ID parameters
- [ ] Missing length limits on string fields (DoS via large payloads) - especially free text fields
- [ ] Missing numeric range checks where applicable
- [ ] Missing type validation on query parameters
- [ ] Accepting arbitrary fields without explicit schema (mass assignment)
- [ ] Shared schemas between client and server drifting or not used consistently

**Example vulnerable pattern:**
```typescript
// BAD - No validation
const body = await request.json()
await supabase.from("table").insert(body)

// BAD - Manual validation, easy to miss edge cases
if (!title || typeof title !== "string") {
  // ...
}
```

---

### 3. SQL Injection & Query Safety

**Check for:**

- [ ] Raw SQL queries with string interpolation of user input
- [ ] User input directly in `.or()`, `.filter()`, `.textSearch()` or `.like()` calls without validation or whitelisting
- [ ] Dynamic table or column names derived from user input
- [ ] Missing parameterized queries in raw SQL usage
- [ ] Direct use of Supabase RPC functions that accept unvalidated JSON

Note: Supabase client helps prevent SQL injection, but unsafe patterns using raw SQL or dynamic identifiers still need review.

---

### 4. Service Role Key Exposure

**Check for:**

- [ ] `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` used in API routes or edge functions that are reachable by arbitrary users
- [ ] Admin client created with service role in client accessible code (including React components and client bundles)
- [ ] Service key used where anon key would suffice
- [ ] Any environment variable with secrets referenced in code that can end up in the browser bundle

**Example vulnerable pattern:**
```typescript
// BAD - Service key in API route
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

---

### 5. Sensitive Data Exposure

**Check for:**

- [ ] Passwords, API keys or secrets in code, `module.json`, or fixtures
- [ ] Full error stack traces returned to client
- [ ] Throwing raw database errors directly in responses
- [ ] Sensitive user data included in responses unnecessarily (email, phone, tokens, internal IDs)
- [ ] `console.log` or other logs with secrets, tokens or PII
- [ ] Exposing internal IDs or implementation details in error messages
- [ ] Returning configuration or environment details to the client

---

### 6. Cross Site Scripting (XSS)

**Check for:**

- [ ] User input rendered without sanitization in components
- [ ] `dangerouslySetInnerHTML` usage without sanitization and without a clear trusted source
- [ ] User provided URLs used in `href` or `src` without validation (check for `javascript:` or data URLs)
- [ ] Rich text or HTML stored without sanitization or controlled rendering
- [ ] Markdown rendering without a safe renderer configuration
- [ ] Any feature that renders custom scripts, HTML widgets or embeds without strict filtering

---

### 7. CSRF, Cookies & Security Headers

**Check for:**

- [ ] API routes accepting state changing requests (POST, PUT, PATCH, DELETE) without CSRF protection if they are callable from browsers
- [ ] Missing origin or `Referer` validation on sensitive routes
- [ ] Sensitive cookies without `HttpOnly`, `Secure` and `SameSite` flags set appropriately
- [ ] Any usage of `localStorage` or `sessionStorage` for tokens instead of secure cookies
- [ ] Lack of explicit security headers in responses where the module controls them (CSP, X Frame Options, etc) if applicable

---

### 8. File Upload Security

**Check for:**

- [ ] Missing file type validation on uploads (MIME type and extension)
- [ ] Missing file size limits
- [ ] User controlled file paths or folder names (path traversal)
- [ ] Saving uploads to locations that can be executed as code
- [ ] Serving user uploaded files from the same domain without strict content type controls
- [ ] No virus or malware scanning for potentially risky file types

---

### 9. Rate Limiting & DoS Prevention

**Check for:**

- [ ] No rate limiting on authentication endpoints (login, signup, password reset)
- [ ] No rate limiting on expensive operations (reports, exports, complex queries)
- [ ] Missing pagination limits (unbounded `select("*")` or equivalent)
- [ ] Endpoints that accept large request bodies without size limits
- [ ] Long running operations in API routes without timeouts or job offloading

---

### 10. Insecure Dependencies & Supply Chain

**Check module `package.json`, `pnpm-lock.yaml` or imports for:**

- [ ] Known vulnerable packages or versions (for example packages called out by `npm audit` or similar tools)
- [ ] Outdated dependencies where security patches are available
- [ ] Unnecessary dependencies that increase attack surface
- [ ] Direct usage of unmaintained or abandoned libraries
- [ ] Use of packages that run arbitrary code at install time without clear justification

---

### 11. Configuration & Secrets Management

**Check for:**

- [ ] Secrets, API keys or tokens hardcoded in code or `module.json`
- [ ] Use of `NEXT_PUBLIC_*` environment variables where values should remain server side
- [ ] Modules relying on environment variables that are not documented or validated
- [ ] Exposure of internal configuration through public endpoints or debug routes
- [ ] Debug flags or unsafe test configuration left enabled

---

### 12. Cryptography & Password Handling

**Check for:**

- [ ] Any custom cryptography instead of standard, battle tested libraries
- [ ] Plain text passwords stored or logged anywhere
- [ ] Incorrect hashing (no salt, custom crazy hashing, obsolete algorithms)
- [ ] Re use of encryption keys for multiple unrelated purposes
- [ ] Token generation using predictable values instead of secure random

---

### 13. URL Handling, Redirects & SSRF

**Check for:**

- [ ] Open redirects using user controlled `redirect` or `next` parameters without validation
- [ ] Server side HTTP calls to user supplied URLs without allowlists (potential SSRF)
- [ ] Webhook endpoints that accept unauthenticated POSTs without signature verification
- [ ] Any external integration that trusts incoming requests without authentication or verification

---

### 14. Multi tenancy & Data Segregation

**Check for:**

- [ ] Queries that do not filter by tenant or organization where they should
- [ ] Mixed tenant data on the same screens or exports
- [ ] Use of global IDs or tables without tenant context
- [ ] Module features that could access or modify data across tenants without strict checks
- [ ] Any reliance only on client provided tenant IDs

---

### 15. Logging, Audit & Observability

**Check for:**

- [ ] Lack of logging on security relevant events (login, logout, password resets, role changes, permission changes, configuration changes)
- [ ] Logging of sensitive data (passwords, secrets, complete tokens)
- [ ] Lack of correlation IDs or request IDs where useful
- [ ] Modules that swallow errors silently without logging

---

### 16. Next.js Specific Concerns

**Check for:**

- [ ] Server only code or secrets accidentally imported into client components
- [ ] Use of `fetch` in server code that might leak secrets through cache or logs
- [ ] Dynamic routes that expose internal IDs or unvalidated parameters
- [ ] Misuse of `revalidate` or caching that might expose private data to other users
- [ ] Middleware that modifies auth or cookies in unexpected ways

---

## Output Format

For each module, output findings in this format:

```md
## [Module Name] (/modules-core/[module-id] or /modules-custom/[module-id])

### [SEVERITY] - Issue Title
- **Location**: `/path/to/file.ts:line_number`
- **Issue**: Description of the security vulnerability
- **Risk**: What could happen if exploited
- **Recommendation**: How to fix the issue

---
```

### Example Output

```md
## Shipments Module (/modules-core/shipments)

### [HIGH] - Missing User ID Filter in GET Endpoint
- **Location**: `/modules-core/shipments/api/items/route.ts:25`
- **Issue**: GET endpoint fetches all shipments without filtering by user_id or tenant
- **Risk**: If RLS is misconfigured, this could expose other users or tenants shipment data
- **Recommendation**: Add explicit `.eq("user_id", user.id)` and tenant filter to the query

### [MEDIUM] - Missing UUID Validation on ID Parameter
- **Location**: `/modules-core/shipments/api/items/route.ts:45`
- **Issue**: ID parameter from query string is not validated as UUID format
- **Risk**: Could accept malformed IDs or injection attempts
- **Recommendation**: Add Zod validation `z.string().uuid()` for the ID parameter

---
```

---

## Scan Procedure

1. **List all modules**
   - Find all directories in `/modules-core` and `/modules-custom`.

2. **For each module**
   - Read `module.json` to understand module permissions, scopes and any declared roles.
   - Scan all files in `/api` directory for route handlers.
   - Scan server actions and any server only utilities.
   - Check each API route and server action against the security checklist above.
   - Scan `/components` and `/app` for XSS vulnerabilities and unsafe data rendering.
   - Check `/lib`, `/utils` or similar directories for sensitive data handling and custom crypto.
   - Review integration code for webhooks, external APIs and third party services.

3. **Compile findings by module**
   - Group issues by module and severity.
   - Avoid duplicate reporting of the same underlying issue unless necessary for clarity.

4. **Generate summary**
   - Produce a summary table with counts by module and severity.
   - List the top 5 issues to address first across all modules.

---

## Final Output Requirements

1. **Module by module findings** as shown above.
2. **Summary table**:

   ```md
   | Module | Critical | High | Medium | Low |
   |--------|----------|------|--------|-----|
   | ...    | ...      | ...  | ...    | ... |
   ```

3. **Top priorities**
   - List the 5 most critical or impactful issues to address first.
   - Explain briefly why they are priority items.

4. **Disclaimer** (MUST INCLUDE):

---

## Disclaimer

**IMPORTANT**: This automated, best effort security scan of all installed modules and may not identify all security vulnerabilities. It should NOT be considered a complete or final security audit.

**Limitations:**
- Cannot detect all logical vulnerabilities or business logic flaws  
- May produce false positives or miss context dependent issues  
- Does not test runtime behavior, only static code analysis  
- Cannot verify RLS policies, database configurations or infrastructure settings in the database or cloud environment  
- Does not scan third party dependencies exhaustively or replace dependency scanning tools  
- Does not review deployment configuration, network security groups or WAF rules

**It is the sole responsibility of the user or developer to thoroughly review all code and follow best practices to ensure the security of their application.**