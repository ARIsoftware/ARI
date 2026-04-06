# ARI Custom Commands

This document describes the repo's custom prompt/command files for Claude Code and OpenAI Codex. These commands provide automated workflows for common development tasks.

**Locations**:
- Claude: `/.claude/commands/`
- Codex: `/.codex/prompts/`
- Shared source/reference copy: `/.agents/commands/`

---

## Available Commands

### `/ari-create-module` - Create a New Module

**Purpose**: Scaffolds a new module in the `modules-custom` directory using the `hello-world` template.

**Usage**: Invoke `/ari-create-module` in Claude Code or the corresponding prompt in Codex to start the interactive wizard.

**What it does**:
1. Reads project documentation (`/docs/MODULES.md`, `/CLAUDE.md`)
2. Asks you questions about your new module:
   - Module name (e.g., "Habit Tracker")
   - Detailed description and features
   - Sidebar navigation preferences
   - Top bar quick-access icon preferences
3. Validates requirements:
   - Derives folder slug in kebab-case
   - Ensures folder doesn't already exist
   - Confirms target directory (`modules-custom` recommended)
4. Creates the module structure:
   - Copies template from `modules-core/hello-world`
   - Updates `module.json` with your settings
   - Creates page component, API routes, and database schema
   - Runs `npm run generate-module-registry`
5. Provides SQL migration file for database setup

**Output**:
- Complete module scaffold in `/modules-custom/[module-slug]/`
- Database migration SQL file ready to run
- Module registered and visible in sidebar

**Best Practices**:
- Always create new modules in `modules-custom/` (not `modules-core/`)
- Follow the auth patterns from the hello-world template
- Include RLS policies in your database schema
- Use proper theming (Tailwind classes, not hardcoded colors)

---

### `/ari-audit-module` - Security Audit

**Purpose**: Performs a comprehensive static code security audit of a single module in `/modules-core` or `/modules-custom`.

**Usage**: Invoke `/ari-audit-module <module-id>`.

**What it checks** (16 categories):

| # | Category | Key Checks |
|---|----------|------------|
| 1 | **Authentication & Authorization** | Missing auth checks, user ID from request body, missing user_id filters, client-side-only permission checks, hardcoded IDs |
| 2 | **Input Validation** | Missing Zod schemas, UUID validation, length limits, numeric ranges, mass assignment |
| 3 | **SQL Injection & Query Safety** | Raw SQL interpolation, unsafe `.or()`/`.filter()` calls, dynamic table names, unvalidated RPC functions |
| 4 | **Service Role Key Exposure** | `SUPABASE_SERVICE_ROLE_KEY` in API routes, secrets in browser bundles |
| 5 | **Sensitive Data Exposure** | Secrets in code, error stack traces, PII in responses, internal IDs in errors |
| 6 | **Cross-Site Scripting (XSS)** | `dangerouslySetInnerHTML`, unsanitized input, unsafe URLs, markdown rendering |
| 7 | **CSRF, Cookies & Headers** | Missing CSRF protection, localStorage for tokens, cookie security flags |
| 8 | **File Upload Security** | File type/size validation, path traversal, executable uploads, virus scanning |
| 9 | **Rate Limiting & DoS** | Missing rate limits, unbounded queries, large payloads, operation timeouts |
| 10 | **Insecure Dependencies** | Known vulnerabilities, outdated packages, unmaintained libraries |
| 11 | **Configuration & Secrets** | Hardcoded secrets, `NEXT_PUBLIC_*` misuse, debug flags enabled |
| 12 | **Cryptography & Passwords** | Custom crypto, plaintext passwords, weak hashing, predictable tokens |
| 13 | **URL Handling & SSRF** | Open redirects, server-side request forgery, unverified webhooks |
| 14 | **Multi-tenancy & Data Segregation** | Missing tenant filters, cross-tenant data access, client-provided tenant IDs |
| 15 | **Logging & Audit** | Missing security event logs, sensitive data in logs, swallowed errors |
| 16 | **Next.js Specific** | Server code in client bundles, caching private data, middleware issues |

**Severity Levels**:
- **CRITICAL**: Immediate exploitation risk, data breach potential, RCE, authentication bypass
- **HIGH**: Significant security flaw, unauthorized access, privilege escalation, data corruption
- **MEDIUM**: Exploitable under certain conditions, weakens defense-in-depth significantly
- **LOW**: Best practice violation, minor defense-in-depth gap

**Output Format**:
```
## [Module Name] (/modules-core/[module-id])

### [SEVERITY] - Issue Title
- **Location**: `/path/to/file.ts:line_number`
- **Issue**: Description of the vulnerability
- **Risk**: What could happen if exploited
- **Recommendation**: How to fix it
```

**Summary Includes**:
- Findings for the requested module with line numbers
- Severity-grouped issue list
- Follow-up priorities
- Security disclaimer

**Important**: This is a static code review and does not replace penetration testing, runtime monitoring, or infrastructure security reviews. Always conduct manual security reviews for production applications.

---

## Creating New Commands

To create a new shared command/prompt:

1. Create or update the canonical copy in `/.agents/commands/[command-name].md`
2. Copy the same content into `/.claude/commands/[command-name].md`
3. Copy the same content into `/.codex/prompts/[command-name].md`
4. Keep all three files in sync when making later edits

**Tips for writing commands**:
- Be specific about what files to read and in what order
- Include example patterns (good and bad)
- Specify the expected output format
- Include validation rules and quality checks
- Add any disclaimers or limitations

---

## Related Documentation

- `/docs/MODULES.md` - Technical reference for module development
- `/docs/MODULES-GUIDE.md` - High-level module overview
- `/CLAUDE.md` - Project conventions and setup
