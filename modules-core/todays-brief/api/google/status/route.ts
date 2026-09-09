/**
 * Today's Brief Module - Google connection status
 *
 * GET /api/modules/todays-brief/google/status
 *
 * Reports whether the server has Google OAuth configured and whether this user
 * has connected their calendar (plus the connected email, for display).
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { getGoogleConfig } from '@/modules/todays-brief/lib/google'
import { GoogleStatusResponseSchema } from '@/modules/todays-brief/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { todaysBriefGoogleTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

registry.registerPath({
  method: 'get',
  path: '/api/modules/todays-brief/google/status',
  operationId: 'getTodaysBriefGoogleStatus',
  summary: 'Whether Google is configured on the server and connected for this user',
  tags: ['todays-brief'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Connection status', content: { 'application/json': { schema: GoogleStatusResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const rows = await withRLS((db) =>
      db.select({ email: todaysBriefGoogleTokens.googleEmail })
        .from(todaysBriefGoogleTokens)
        .where(eq(todaysBriefGoogleTokens.userId, user.id))
        .limit(1)
    )

    return NextResponse.json({
      connected: rows.length > 0,
      configured: getGoogleConfig() !== null,
      email: rows[0]?.email ?? null,
    })
  } catch (error) {
    console.error('GET /api/modules/todays-brief/google/status error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
