/**
 * Morning Brief Module - Remove calendar subscription
 *
 * DELETE /api/modules/morning-brief/ical/disconnect
 *
 * Deletes the user's stored iCal feed. The brief stops showing those meetings.
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { GoogleDisconnectResponseSchema } from '@/modules/morning-brief/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { morningBriefIcalSubscriptions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

registry.registerPath({
  method: 'delete',
  path: '/api/modules/morning-brief/ical/disconnect',
  operationId: 'disconnectMorningBriefIcal',
  summary: 'Remove the subscribed calendar feed',
  tags: ['morning-brief'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Removed', content: { 'application/json': { schema: GoogleDisconnectResponseSchema } } },
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
      db.delete(morningBriefIcalSubscriptions)
        .where(eq(morningBriefIcalSubscriptions.userId, user.id))
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/modules/morning-brief/ical/disconnect error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
