/**
 * Morning Brief Module - iCal subscription status
 *
 * GET /api/modules/morning-brief/ical/status
 *
 * Reports whether the user has a subscribed calendar feed, and the feed's
 * hostname for display (never the secret URL itself).
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { IcalStatusResponseSchema } from '@/modules/morning-brief/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { morningBriefIcalSubscriptions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { decrypt } from '@/lib/crypto'

registry.registerPath({
  method: 'get',
  path: '/api/modules/morning-brief/ical/status',
  operationId: 'getMorningBriefIcalStatus',
  summary: 'Whether the user has subscribed to a calendar feed (and its host)',
  tags: ['morning-brief'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Subscription status', content: { 'application/json': { schema: IcalStatusResponseSchema } } },
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
      db.select({ icsUrl: morningBriefIcalSubscriptions.icsUrl })
        .from(morningBriefIcalSubscriptions)
        .where(eq(morningBriefIcalSubscriptions.userId, user.id))
        .limit(1)
    )

    const row = rows[0]
    if (!row?.icsUrl) {
      return NextResponse.json({ subscribed: false, host: null })
    }

    let host: string | null = null
    try {
      host = new URL(decrypt(row.icsUrl)).hostname
    } catch {
      host = null
    }

    return NextResponse.json({ subscribed: true, host })
  } catch (error) {
    console.error('GET /api/modules/morning-brief/ical/status error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
