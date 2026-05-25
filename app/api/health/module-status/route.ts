/**
 * Health endpoint to check module status
 *
 * Returns detailed information about why modules might not be loading
 * Used by /health page to diagnose module issues
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { moduleSettings } from '@/lib/db/schema'
import { getModules } from '@/lib/modules/module-registry'
import { safeErrorResponse } from '@/lib/api-error'
import { eq } from 'drizzle-orm'
import { HealthModuleStatusSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'

export const debugRole = "health-module-status"

registry.registerPath({
  method: 'get',
  path: '/api/health/module-status',
  operationId: 'getHealthModuleStatus',
  summary: 'Diagnostic snapshot of module discovery + per-user enable state',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: {
      description: 'Module status report (returns { authenticated: false } if the request reaches the handler without auth — middleware normally blocks first with 401)',
      content: { 'application/json': { schema: HealthModuleStatusSchema } },
    },
    401: { description: 'Unauthorized (returned by middleware when no session/API key)', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()

    if (!user || !withRLS) {
      return NextResponse.json({
        error: 'No authenticated user',
        authenticated: false
      })
    }

    const allModules = await getModules()

    // Get user's module settings
    const settings = await withRLS((db) =>
      db.select().from(moduleSettings).where(eq(moduleSettings.userId, user.id))
    )

    // Build a per-user enabled map: a module is enabled iff its manifest is
    // enabled AND the user hasn't explicitly disabled it.
    const userDisabled = new Set(
      settings
        .filter((s: any) => s.enabled === false)
        .map((s: any) => s.moduleId ?? s.module_id)
        .filter(Boolean)
    )

    const moduleChecks: Record<string, { exists: true; enabled: boolean }> = {}
    for (const m of allModules) {
      moduleChecks[m.id] = {
        exists: true,
        enabled: m.enabled !== false && !userDisabled.has(m.id),
      }
    }

    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      allModules: allModules.map(m => ({ id: m.id, enabled: m.enabled })),
      userSettings: settings,
      moduleChecks,
    })
  } catch (error: unknown) {
    console.error('[Debug] Module status error:', error)
    return NextResponse.json({
      error: safeErrorResponse(error)
    }, { status: 500 })
  }
}
