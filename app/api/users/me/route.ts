import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { CurrentUserResponseSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { withApiLogging } from '@/lib/api-logging'

registry.registerPath({
  method: 'get',
  path: '/api/users/me',
  operationId: 'getCurrentUser',
  summary: 'Current account with role and effective permissions',
  description: 'Reads role/permissions from the live DB row (not the cached session), so the UI can gate features without waiting for a session refresh.',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Current user', content: { 'application/json': { schema: CurrentUserResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

async function handleGET() {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) return createErrorResponse('Authentication required', 401)

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.user_metadata.full_name ?? null,
      first_name: user.user_metadata.first_name ?? null,
      last_name: user.user_metadata.last_name ?? null,
      image: user.user_metadata.avatar_url ?? null,
      role: user.role,
      permissions: user.permissions,
    })
  } catch (error) {
    console.error('Failed to load current user:', error)
    return createErrorResponse('Failed to load current user', 500)
  }
}

export const GET = withApiLogging(handleGET)
