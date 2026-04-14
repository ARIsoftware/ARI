/**
 * Batch Module Management API
 *
 * POST /api/modules/batch - Enable/disable multiple modules at once
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { setModuleEnabled } from '@/lib/modules/module-registry'

interface ModuleChange {
  moduleId: string
  enabled: boolean
}

/**
 * POST /api/modules/batch
 * Enable or disable multiple modules for the authenticated user
 *
 * Body: { changes: Array<{ moduleId: string, enabled: boolean }> }
 */
export async function POST(request: NextRequest) {
  const { user, withRLS } = await getAuthenticatedUser()

  if (!user || !withRLS) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

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
