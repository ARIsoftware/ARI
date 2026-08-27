/**
 * Aggregate health scan — "one call, one reply".
 *
 * Runs every server-side check from `lib/health/checks.ts` and normalises each
 * into a `HealthCheckResult`. The raw per-endpoint payload is preserved under
 * `details`, so this response is a strict superset of the individual
 * `/api/health/*` endpoints.
 *
 * Browser-only probes on the /health page (cross-module route fetches, the
 * storage upload round-trip, and the unauthenticated-access security probes)
 * are intentionally NOT included — they require a real HTTP client with a
 * separate origin/credential context and cannot be answered server-side.
 */

import {
  checkAiProviders,
  checkAuthConfig,
  checkDatabase,
  checkModuleStatus,
  checkMultiUser,
  checkStorageFilesystem,
  runRlsTest,
  type WithRLS,
} from '@/lib/health/checks'
import { safeErrorResponse } from '@/lib/api-error'
import type { HealthCheckResult, HealthScanResult, HealthStatus } from '@/lib/health/types'

export interface ScanContext {
  userId: string
  withRLS: WithRLS
}

/** A check's verdict before timing is attached. */
type Verdict = { status: HealthStatus; message: string; details?: unknown }

interface CheckDefinition {
  id: string
  name: string
  run: (ctx: ScanContext) => Promise<Verdict>
}

/**
 * The scan registry. Order here is the order results are returned in — the
 * checks themselves run concurrently.
 */
const CHECKS: CheckDefinition[] = [
  {
    id: 'database',
    name: 'Database Connectivity',
    run: async () => {
      const details = await checkDatabase()
      return details.status === 'ok'
        ? { status: 'ok', message: 'Connected', details }
        : {
            status: 'fail',
            message: details.checks.database?.message ?? 'Database check failed',
            details,
          }
    },
  },
  {
    id: 'auth-config',
    name: 'Auth Configuration',
    run: async () => {
      const details = checkAuthConfig()
      const missing: string[] = []
      if (!details.secretConfigured) missing.push('BETTER_AUTH_SECRET (missing or under 32 chars)')
      if (!details.databaseConfigured) missing.push('DATABASE_URL')
      if (missing.length > 0) {
        return { status: 'fail', message: `Not configured: ${missing.join(', ')}`, details }
      }
      // Only a problem in production — localhost origins are correct in dev.
      if (details.isProduction && !details.hasProductionOrigin) {
        return {
          status: 'warn',
          message: 'Running in production without a non-localhost NEXT_PUBLIC_APP_URL',
          details,
        }
      }
      return { status: 'ok', message: 'Secret and database URL configured', details }
    },
  },
  {
    id: 'multi-user',
    name: 'Multi-User Setup',
    run: async () => {
      const details = await checkMultiUser()
      if (details === null) {
        return { status: 'fail', message: 'Database not available' }
      }
      if (details.ok) {
        return {
          status: 'ok',
          message: `Schema present, ${details.activeAdminCount} active admin(s)`,
          details,
        }
      }
      const problems: string[] = []
      if (!details.columnsPresent) {
        problems.push(`missing user columns: ${details.missingColumns.join(', ')}`)
      }
      if (!details.sharedAccessFunction) problems.push('app.can_access_shared() missing')
      if (!details.hasActiveAdmin) problems.push('no active admin')
      return { status: 'fail', message: problems.join('; '), details }
    },
  },
  {
    id: 'rls',
    name: 'RLS Isolation',
    run: async (ctx) => {
      const details = await runRlsTest(ctx.userId, ctx.withRLS)
      if (details.success) {
        // A bypassing role is the documented default, but it means RLS is not
        // the enforcing boundary — worth stating in the summary line.
        return {
          status: 'ok',
          message: details.bypassRls
            ? 'Positive test passed (role bypasses RLS — app layer enforces isolation)'
            : 'Positive and negative isolation tests passed',
          details,
        }
      }
      return {
        status: 'fail',
        message: details.positiveTest.passed
          ? 'Negative isolation test failed — another user context saw this user rows'
          : 'Positive isolation test failed — user cannot read their own row',
        details,
      }
    },
  },
  {
    id: 'storage-filesystem',
    name: 'Filesystem Storage',
    run: async () => {
      const details = await checkStorageFilesystem()
      if (!details.applicable) {
        return {
          status: 'skip',
          message: `Provider is "${details.provider}" — filesystem check not applicable`,
          details,
        }
      }
      if (details.error || !details.writable) {
        return {
          status: 'fail',
          message: details.error ?? `Not writable: ${details.basePath}`,
          details,
        }
      }
      if (details.isEphemeral) {
        return {
          status: 'warn',
          message: 'Writable, but storage is ephemeral on this host — uploads will not persist',
          details,
        }
      }
      return { status: 'ok', message: `Writable: ${details.basePath}`, details }
    },
  },
  {
    id: 'modules',
    name: 'Module Status',
    run: async (ctx) => {
      const details = await checkModuleStatus(ctx.userId, ctx.withRLS)
      const enabled = Object.values(details.moduleChecks).filter((m) => m.enabled).length
      return {
        status: 'ok',
        message: `${enabled} of ${details.allModules.length} modules enabled`,
        details,
      }
    },
  },
  {
    id: 'ai-providers',
    name: 'AI Providers',
    run: async (ctx) => {
      const details = await checkAiProviders(ctx.withRLS)
      return details.configuredCount > 0
        ? { status: 'ok', message: `${details.configuredCount} provider(s) configured`, details }
        : { status: 'warn', message: 'No AI provider configured', details }
    },
  },
]

/** Run one check, timing it and converting a thrown error into a `fail`. */
async function runOne(def: CheckDefinition, ctx: ScanContext): Promise<HealthCheckResult> {
  const started = Date.now()
  try {
    const verdict = await def.run(ctx)
    return { id: def.id, name: def.name, ...verdict, durationMs: Date.now() - started }
  } catch (err) {
    return {
      id: def.id,
      name: def.name,
      status: 'fail',
      message: safeErrorResponse(err),
      durationMs: Date.now() - started,
    }
  }
}

/**
 * Run every check concurrently and return the aggregate.
 *
 * Never throws: an individual check that blows up is reported as a `fail`
 * entry so a single broken check can't take down the whole scan.
 */
export async function runHealthScan(ctx: ScanContext): Promise<HealthScanResult> {
  const startedAtMs = Date.now()
  const startedAt = new Date(startedAtMs).toISOString()

  const checks = await Promise.all(CHECKS.map((def) => runOne(def, ctx)))

  const summary = {
    total: checks.length,
    ok: checks.filter((c) => c.status === 'ok').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
    skip: checks.filter((c) => c.status === 'skip').length,
  }

  // Worst non-skip status wins.
  const status: HealthScanResult['status'] =
    summary.fail > 0 ? 'fail' : summary.warn > 0 ? 'warn' : 'ok'

  return { status, startedAt, durationMs: Date.now() - startedAtMs, summary, checks }
}

/** Ids of every check the scan runs — exported for tests and UI labelling. */
export const HEALTH_CHECK_IDS = CHECKS.map((c) => c.id)
