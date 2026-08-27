/**
 * Shared types for the health-check system.
 *
 * `lib/health/checks.ts` owns the per-check logic; the individual
 * `/api/health/*` routes and the aggregate `/api/health/full` route are thin
 * glue over it. Keeping the logic here (rather than in route handlers) means
 * the aggregate can never drift from the individual endpoints, and lets a
 * future in-process scheduler run a scan without going back through HTTP.
 */

/**
 * Normalised verdict for a single check.
 *
 * - `ok`   — passed.
 * - `warn` — not broken, but worth surfacing (e.g. no AI provider configured).
 * - `fail` — actionable problem.
 * - `skip` — not applicable to this install (e.g. filesystem checks when the
 *            storage provider is S3), so it counts as neither pass nor fail.
 */
export type HealthStatus = 'ok' | 'warn' | 'fail' | 'skip'

/** One check's normalised outcome, plus the raw endpoint payload. */
export interface HealthCheckResult {
  /** Stable machine id — safe to key alerts and history rows on. */
  id: string
  /** Human-readable name, as shown on /health. */
  name: string
  status: HealthStatus
  /** One-line explanation. Always populated, including on `ok`. */
  message: string
  durationMs: number
  /**
   * The exact payload the corresponding `/api/health/*` endpoint returns, so
   * the aggregate is a superset of the individual routes and callers never
   * need a second request to get the detail.
   */
  details?: unknown
}

/** Aggregate result of a full scan. */
export interface HealthScanResult {
  /** Worst non-skip status across all checks. */
  status: 'ok' | 'warn' | 'fail'
  /** ISO-8601 timestamp of when the scan began. */
  startedAt: string
  /** Wall-clock duration of the whole scan. */
  durationMs: number
  summary: {
    total: number
    ok: number
    warn: number
    fail: number
    skip: number
  }
  checks: HealthCheckResult[]
}
