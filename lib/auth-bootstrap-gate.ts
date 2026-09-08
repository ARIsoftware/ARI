/**
 * Gate for Better Auth user creation.
 *
 * The anonymous→admin boundary (first account is promoted to admin by the
 * boot-time backfill in setup.sql) must not rest solely on proxy.ts's
 * string-match block of /api/auth/sign-up — any middleware gap would reopen
 * instant anonymous takeover. This gate makes the auth layer itself the
 * backstop: lib/auth.ts rejects ALL Better Auth user creation unless the
 * first-run bootstrap opened the gate around its server-side signUpEmail
 * call. Nothing else legitimately creates users through Better Auth — the
 * Users module inserts rows directly via its own admin-gated API.
 *
 * A depth counter (not a boolean) so nested/concurrent bootstrap attempts
 * (already serialized by bootstrap's advisory lock) can never wedge the gate
 * closed or leave it open: try/finally guarantees it closes.
 */

let depth = 0

export function isBootstrapUserCreateAllowed(): boolean {
  return depth > 0
}

export async function withBootstrapUserCreate<T>(fn: () => Promise<T>): Promise<T> {
  depth++
  try {
    return await fn()
  } finally {
    depth--
  }
}
