/**
 * Postgres error helpers.
 *
 * Errors do not always surface as the raw `pg` DatabaseError: Drizzle wraps
 * them in DrizzleQueryError (`Failed query: …` with the real error on
 * `cause`), so readers that look only at the top-level object miss the
 * SQLSTATE. Every helper here walks the `cause` chain first.
 */

export interface PgErrorLike {
  code?: string
  message?: string
}

const MAX_CAUSE_DEPTH = 8

/**
 * The underlying Postgres error (the first object in the `cause` chain that
 * carries a SQLSTATE-shaped `code`), or the error itself when none does.
 */
export function getPgError(err: unknown): PgErrorLike | null {
  let current: unknown = err
  for (
    let depth = 0;
    depth < MAX_CAUSE_DEPTH && current !== null && typeof current === 'object';
    depth++
  ) {
    const candidate = current as PgErrorLike & { cause?: unknown }
    if (typeof candidate.code === 'string') return candidate
    current = candidate.cause
  }
  return err !== null && typeof err === 'object' ? (err as PgErrorLike) : null
}

/** SQLSTATE (or Node error code) of an error, looking through Drizzle's wrapper. */
export function getPgCode(err: unknown): string | undefined {
  return getPgError(err)?.code
}

/** Every message along the `cause` chain, outermost first. */
export function getErrorMessages(err: unknown): string[] {
  const out: string[] = []
  let current: unknown = err
  for (
    let depth = 0;
    depth < MAX_CAUSE_DEPTH && current !== null && typeof current === 'object';
    depth++
  ) {
    const candidate = current as { message?: unknown; cause?: unknown }
    if (typeof candidate.message === 'string') out.push(candidate.message)
    current = candidate.cause
  }
  return out
}
