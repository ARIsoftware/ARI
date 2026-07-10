/**
 * Morning Brief Module - Subscribe to a calendar feed
 *
 * POST /api/modules/morning-brief/ical/subscribe  { url }
 *
 * Validates that the URL returns an iCal feed, then stores it ENCRYPTED (the
 * "secret address" is sensitive) as the user's single subscription. When a
 * subscription exists the calendar route reads it instead of Google OAuth.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { IcalSubscribeSchema, IcalStatusResponseSchema } from '@/modules/morning-brief/lib/validation'
import { fetchIcsText, looksLikeIcs } from '@/modules/morning-brief/lib/ical'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { morningBriefIcalSubscriptions } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'
import { encrypt } from '@/lib/crypto'

registry.registerPath({
  method: 'post',
  path: '/api/modules/morning-brief/ical/subscribe',
  operationId: 'subscribeMorningBriefIcal',
  summary: 'Subscribe to a calendar (.ics) feed URL',
  tags: ['morning-brief'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: IcalSubscribeSchema } } } },
  responses: {
    200: { description: 'Subscribed', content: { 'application/json': { schema: IcalStatusResponseSchema } } },
    400: { description: 'Invalid or unreachable calendar URL', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: UnauthorizedResponse,
    500: InternalServerErrorResponse,
  },
})

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, IcalSubscribeSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const rawUrl = validation.data.url.trim()
    let parsed: URL
    try {
      parsed = new URL(rawUrl)
    } catch {
      return createErrorResponse('That is not a valid URL.', 400)
    }
    // Block non-web schemes (e.g. file:, ftp:) — Google feeds are http(s).
    // Many calendars use a webcal:// scheme that is really https.
    if (parsed.protocol === 'webcal:') {
      parsed.protocol = 'https:'
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return createErrorResponse('Use an http(s) or webcal calendar link.', 400)
    }

    // Verify it actually returns a calendar before saving — clearer than a
    // silent failure later when the brief tries to read it.
    try {
      const ics = await fetchIcsText(parsed.toString())
      if (!looksLikeIcs(ics)) {
        return createErrorResponse('That link did not return a calendar (.ics) feed.', 400)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('morning-brief ical subscribe validation error:', msg)
      return createErrorResponse('Could not read that calendar link. Check the URL and try again.', 400)
    }

    const encrypted = encrypt(parsed.toString())
    await withRLS((db) =>
      db.insert(morningBriefIcalSubscriptions)
        .values({ userId: user.id, icsUrl: encrypted })
        .onConflictDoUpdate({
          target: morningBriefIcalSubscriptions.userId,
          set: { icsUrl: encrypted, updatedAt: new Date().toISOString() },
        })
    )

    return NextResponse.json({ subscribed: true, host: parsed.hostname })
  } catch (error) {
    console.error('POST /api/modules/morning-brief/ical/subscribe error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
