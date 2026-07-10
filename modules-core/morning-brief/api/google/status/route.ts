/**
 * Morning Brief Module - Google connection status
 *
 * GET /api/modules/morning-brief/google/status
 *
 * Reports whether the server has Google OAuth configured and whether this user
 * has connected their calendar (plus the connected email, for display).
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { getGoogleConfig } from '@/modules/morning-brief/lib/google'
import { GoogleStatusResponseSchema } from '@/modules/morning-brief/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { morningBriefGoogleTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

registry.registerPath({
  method: 'get',
  path: '/api/modules/morning-brief/google/status',
  operationId: 'getMorningBriefGoogleStatus',
  summary: 'Whether Google is configured on the server and connected for this user',
  tags: ['morning-brief'],
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
      db.select({ email: morningBriefGoogleTokens.googleEmail })
        .from(morningBriefGoogleTokens)
        .where(eq(morningBriefGoogleTokens.userId, user.id))
        .limit(1)
    )

    return NextResponse.json({
      connected: rows.length > 0,
      configured: getGoogleConfig() !== null,
      email: rows[0]?.email ?? null,
    })
  } catch (error) {
    console.error('GET /api/modules/morning-brief/google/status error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
