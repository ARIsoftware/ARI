/**
 * Module Management API
 *
 * GET /api/modules - List all enabled modules for current user
 * GET /api/modules/[id] - Get specific module metadata
 * POST /api/modules/[id]/toggle - Enable/disable a module
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { getEnabledModules, setModuleEnabled } from '@/lib/modules/module-registry'
import {
  toggleModuleSchema,
  ToggleModuleResponseSchema,
  ListEnabledModulesResponseSchema,
} from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/modules',
  operationId: 'listEnabledModules',
  summary: "List the user's enabled modules",
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Enabled modules + count', content: { 'application/json': { schema: ListEnabledModulesResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules',
  operationId: 'toggleModule',
  summary: 'Enable or disable a single module for the user',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: toggleModuleSchema } } } },
  responses: {
    200: { description: 'Module toggled', content: { 'application/json': { schema: ToggleModuleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

/**
 * GET /api/modules
 * Returns all enabled modules for the authenticated user
 */
export async function GET(request: NextRequest) {
  const { user, withRLS } = await getAuthenticatedUser()

  // Validate authentication
  if (!user || !withRLS) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    // Get enabled modules for this user
    const modules = await getEnabledModules(user.id)

    return NextResponse.json({
      modules,
      count: modules.length
    })
  } catch (error: unknown) {
    console.error('[API /modules] Error:', error)
    return NextResponse.json(
      { error: 'Failed to load modules' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/modules
 * Enable or disable a module for the authenticated user
 *
 * Body: { moduleId: string, enabled: boolean }
 */
export async function POST(request: NextRequest) {
  const { user, withRLS } = await getAuthenticatedUser()

  // Validate authentication
  if (!user || !withRLS) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { moduleId, enabled } = body

    if (!moduleId || typeof moduleId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid moduleId' },
        { status: 400 }
      )
    }

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid enabled value (must be boolean)' },
        { status: 400 }
      )
    }

    // Update module enabled state
    const result = await setModuleEnabled(moduleId, user.id, enabled)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to update module' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      moduleId,
      enabled
    })
  } catch (error: unknown) {
    console.error('[API /modules POST] Error:', error)
    return NextResponse.json(
      { error: 'Failed to update module' },
      { status: 500 }
    )
  }
}
