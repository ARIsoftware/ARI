/**
 * Get Enabled Modules API
 *
 * Returns list of modules that are enabled for the current user
 */

import { NextResponse } from 'next/server'
import { getEnabledModules } from '@/lib/modules/module-registry'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { ListEnabledModulesResponseSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/modules/enabled',
  operationId: 'listEnabledModulesSummary',
  summary: 'List enabled modules (id + name + enabled flag only)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Enabled modules summary', content: { 'application/json': { schema: ListEnabledModulesResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  try {
    // Require authentication
    const { user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Get enabled modules for current user
    const modules = await getEnabledModules()

    return NextResponse.json({
      modules: modules.map(module => ({
        id: module.id,
        name: module.name,
        enabled: module.enabled
      }))
    })
  } catch (error: unknown) {
    console.error('[API] Error fetching enabled modules:', error)
    return NextResponse.json(
      { error: 'Failed to fetch enabled modules' },
      { status: 500 }
    )
  }
}
