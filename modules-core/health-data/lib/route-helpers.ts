/**
 * Shared gating for the Health Data read routes: authenticate, purge
 * expired data, and require a completed unexpired import.
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { getCompletedImport, type WithRLS } from './retention'
import type { healthDataImports } from '@/lib/db/schema'

type ImportRow = typeof healthDataImports.$inferSelect

interface HealthDataContext {
  user: { id: string }
  withRLS: WithRLS
  importRow: ImportRow
}

type GateResult = { ok: true; ctx: HealthDataContext } | { ok: false; response: NextResponse }

export async function requireHealthData(): Promise<GateResult> {
  const { user, withRLS } = await getAuthenticatedUser()
  if (!user || !withRLS) {
    return { ok: false, response: createErrorResponse('Unauthorized - Valid authentication required', 401) }
  }

  const importRow = await getCompletedImport(withRLS, user.id)
  if (!importRow) {
    return { ok: false, response: createErrorResponse('No health data available', 404) }
  }

  return { ok: true, ctx: { user, withRLS, importRow } }
}
