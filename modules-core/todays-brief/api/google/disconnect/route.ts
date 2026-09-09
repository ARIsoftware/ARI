/**
 * Today's Brief Module - Disconnect Google
 *
 * DELETE /api/modules/todays-brief/google/disconnect
 *
 * Removes the user's stored Google tokens. Revoking ARI's access on Google's
 * side (myaccount.google.com → Security → Third-party access) is the user's
 * choice; this just forgets the tokens locally.
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { GoogleDisconnectResponseSchema } from '@/modules/todays-brief/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { todaysBriefGoogleTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

registry.registerPath({
  method: 'delete',
  path: '/api/modules/todays-brief/google/disconnect',
  operationId: 'disconnectTodaysBriefGoogle',
  summary: 'Forget the stored Google Calendar tokens for this user',
  tags: ['todays-brief'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Disconnected', content: { 'application/json': { schema: GoogleDisconnectResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

export async function DELETE() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    await withRLS((db) =>
      db.delete(todaysBriefGoogleTokens)
        .where(eq(todaysBriefGoogleTokens.userId, user.id))
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/modules/todays-brief/google/disconnect error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
