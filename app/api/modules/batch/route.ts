/**
 * Batch Module Management API
 *
 * POST /api/modules/batch - Enable/disable multiple modules at once
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { requirePermission } from '@/lib/api-helpers'
import { setModuleEnabled } from '@/lib/modules/module-registry'
import { logActivity } from '@/lib/activity-log'
import { batchModulesSchema, BatchModulesResponseSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { withApiLogging } from '@/lib/api-logging'

interface ModuleChange {
  moduleId: string
  enabled: boolean
}

registry.registerPath({
  method: 'post',
  path: '/api/modules/batch',
  operationId: 'batchToggleModules',
  summary: 'Enable/disable many modules in a single call',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: batchModulesSchema } } } },
  responses: {
    200: { description: 'All changes applied', content: { 'application/json': { schema: BatchModulesResponseSchema } } },
    400: { description: 'Validation error or partial failure', content: { 'application/json': { schema: BatchModulesResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

/**
 * POST /api/modules/batch
 * Enable or disable multiple modules for the authenticated user
 *
 * Body: { changes: Array<{ moduleId: string, enabled: boolean }> }
 */
async function handlePOST(request: NextRequest) {
  const { user, withRLS } = await getAuthenticatedUser()

  if (!user || !withRLS) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const denied = requirePermission(user, 'manage_modules', 'You do not have permission to enable or disable modules')
  if (denied) return denied

  try {
    const body = await request.json()
    const { changes } = body as { changes: ModuleChange[] }

    if (!Array.isArray(changes) || changes.length === 0) {
      return NextResponse.json(
        { error: 'Invalid changes array' },
        { status: 400 }
      )
    }

    // Validate all changes before applying
    for (const change of changes) {
      if (!change.moduleId || typeof change.moduleId !== 'string') {
        return NextResponse.json(
          { error: `Invalid moduleId in changes` },
          { status: 400 }
        )
      }
      if (typeof change.enabled !== 'boolean') {
        return NextResponse.json(
          { error: `Invalid enabled value for module ${change.moduleId}` },
          { status: 400 }
        )
      }
    }

    // Apply all changes
    const results: { moduleId: string; success: boolean; error?: string; warning?: string }[] = []

    for (const { moduleId, enabled } of changes) {
      const result = await setModuleEnabled(moduleId, user.id, enabled)
      results.push({
        moduleId,
        success: result.success,
        error: result.error,
        warning: result.warning
      })
      if (result.success) {
        logActivity({
          userId: user.id,
          type: enabled ? 'module_enabled' : 'module_disabled',
          description: `${enabled ? 'Enabled' : 'Disabled'} module "${moduleId}"`,
          source: 'modules',
          metadata: { moduleId },
        })
      }
    }

    // Check if any failed
    const failures = results.filter(r => !r.success)
    if (failures.length > 0) {
      return NextResponse.json({
        success: false,
        results,
        error: `Failed to update ${failures.length} module(s)`
      }, { status: 400 })
    }

    // Collect warnings (e.g. schema already exists — non-fatal)
    const warnings = results
      .filter(r => r.warning)
      .map(r => r.warning)

    return NextResponse.json({
      success: true,
      results,
      updated: changes.length,
      ...(warnings.length > 0 && { warnings })
    })
  } catch (error: unknown) {
    console.error('[API /modules/batch POST] Error:', error)
    return NextResponse.json(
      { error: 'Failed to update modules' },
      { status: 500 }
    )
  }
}

export const POST = withApiLogging(handlePOST)
