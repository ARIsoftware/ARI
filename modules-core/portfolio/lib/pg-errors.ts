/**
 * Server-side Postgres error helpers.
 *
 * Drizzle may wrap the driver error (as `cause`), so we walk the chain
 * looking for the SQLSTATE code.
 */

const UNIQUE_VIOLATION = '23505'

export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}
