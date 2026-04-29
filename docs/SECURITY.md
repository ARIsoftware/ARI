# ARI Security: Data Isolation Architecture

ARI uses a layered approach to protect user data. No single layer is solely responsible — they work together to ensure data isolation.

## Layer 1: Middleware Authentication (Primary)

All routes require authentication via Better Auth session cookies, except:
- `/sign-in`
- `/api/auth/*`
- `/database-error`

The middleware at `/middleware.ts` validates sessions before allowing access. API routes return `401 Unauthorized`; page routes redirect to `/sign-in`. The sign-up endpoint is blocked at the middleware level — only server-side bootstrap can create accounts.

## Layer 2: Application-Level Query Filtering (Primary)

Every API route calls `getAuthenticatedUser()` which validates the session server-side and provides a `withRLS()` helper. This helper wraps queries in a transaction that sets `SET LOCAL app.current_user_id`.

**All SELECT/UPDATE/DELETE queries MUST include explicit user ID filters.** Do not rely on implicit DB-level RLS filtering — the default Supabase `postgres` role has `BYPASSRLS`.

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

RLS policies exist on all tables using `current_setting('app.current_user_id')`. These are **not enforced** with the default Supabase `postgres` role (which has `BYPASSRLS`). They serve as defense-in-depth and activate if a restricted database role is used in the future.

Each module defines its own RLS policies in `database/schema.sql` (auto-run on module enable). See `modules-core/module-template/database/schema.sql` for the canonical policy pattern.

### Optional Hardening: Restricted Database Role

For true DB-level enforcement, create a role without `BYPASSRLS` and use it for application connections. This is not required for the default setup — it adds complexity for open source deployments.

## Security Headers

Set in `/middleware.ts`:

| Header | Value |
|--------|-------|
| Content-Security-Policy | `unsafe-eval` only in development; `unsafe-inline` kept (Next.js requirement) |
| Strict-Transport-Security | Enabled (HSTS) |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `strict-origin-when-cross-origin` |

## SSL Configuration

- **Production**: Full SSL certificate validation enabled.
- **Development**: Self-signed certificates allowed (`rejectUnauthorized: false`).

## API Security Checklist for Contributors

When writing new API routes or module APIs:

1. Call `getAuthenticatedUser()` and verify both `user` and `withRLS` exist
2. Add `.where(eq(table.userId, user.id))` to all SELECT queries
3. Add `.where(and(eq(table.id, id), eq(table.userId, user.id)))` to UPDATE/DELETE by ID
4. Set `user_id: user.id` in all INSERT values
5. Never rely on implicit RLS filtering alone
6. Use `createErrorResponse()` from `lib/api-helpers.ts` or `safeErrorResponse()` from `lib/api-error.ts` in catch blocks — never expose internal error details to the client
