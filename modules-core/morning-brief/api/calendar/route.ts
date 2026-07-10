/**
 * Morning Brief Module - Calendar API
 *
 * GET /api/modules/morning-brief/calendar
 *
 * Returns today's meetings from the user's Google primary calendar, fetched
 * LIVE on every request (never cached). Refreshes the Google access token from
 * the stored refresh token as needed. "Today" is bounded by the user's
 * timezone from /settings.
 */

import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createErrorResponse } from '@/lib/api-helpers'
import { CalendarResponseSchema } from '@/modules/morning-brief/lib/validation'
import { getGoogleConfig, refreshAccessToken, fetchTodaysEvents } from '@/modules/morning-brief/lib/google'
import { fetchTodaysIcalEvents } from '@/modules/morning-brief/lib/ical'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse, UnauthorizedResponse } from '@/lib/openapi/common'
import { morningBriefGoogleTokens, morningBriefIcalSubscriptions, userPreferences } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { encrypt, decrypt } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

registry.registerPath({
  method: 'get',
  path: '/api/modules/morning-brief/calendar',
  operationId: 'getMorningBriefCalendar',
  summary: "List today's Google Calendar meetings (live, never cached)",
  tags: ['morning-brief'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: "Today's meetings", content: { 'application/json': { schema: CalendarResponseSchema } } },
    401: UnauthorizedResponse,
    409: { description: 'Google access expired — reconnect required', content: { 'application/json': { schema: ErrorResponseSchema } } },
    502: { description: 'Google Calendar request failed', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    // Timezone, subscription, and token rows are independent single-row reads.
    const [prefsRows, icalRows, tokenRows] = await Promise.all([
      withRLS((db) =>
        db.select({ timezone: userPreferences.timezone })
          .from(userPreferences)
          .where(eq(userPreferences.userId, user.id))
          .limit(1)
      ),
      withRLS((db) =>
        db.select({ icsUrl: morningBriefIcalSubscriptions.icsUrl })
          .from(morningBriefIcalSubscriptions)
          .where(eq(morningBriefIcalSubscriptions.userId, user.id))
          .limit(1)
      ),
      withRLS((db) =>
        db.select().from(morningBriefGoogleTokens)
          .where(eq(morningBriefGoogleTokens.userId, user.id))
          .limit(1)
      ),
    ])
    const timezone = prefsRows[0]?.timezone || 'UTC'

    // A subscribed iCal feed takes precedence over OAuth — it's the explicit,
    // simpler choice and needs no token refresh.
    const icalRow = icalRows[0]
    if (icalRow?.icsUrl) {
      try {
        const events = await fetchTodaysIcalEvents(decrypt(icalRow.icsUrl), timezone)
        return NextResponse.json({ connected: true, events, timezone })
      } catch (err) {
        console.error('morning-brief ical fetch error:', err instanceof Error ? err.message : err)
        return createErrorResponse('Could not load your subscribed calendar. Check the link in settings.', 502)
      }
    }

    const tokenRow = tokenRows[0]
    if (!tokenRow) {
      return NextResponse.json({ connected: false, events: [], timezone })
    }

    // Decide whether the stored access token is still usable (60s safety margin).
    let accessToken: string | null = null
    if (tokenRow.accessToken && tokenRow.tokenExpiresAt) {
      const expiresMs = new Date(tokenRow.tokenExpiresAt).getTime()
      if (Number.isFinite(expiresMs) && expiresMs > Date.now() + 60_000) {
        accessToken = decrypt(tokenRow.accessToken)
      }
    }

    // Refresh if needed.
    if (!accessToken) {
      const config = getGoogleConfig()
      if (!config) {
        return createErrorResponse('Google integration is not configured on this server.', 409)
      }
      try {
        const refreshed = await refreshAccessToken(config, decrypt(tokenRow.refreshToken))
        accessToken = refreshed.access_token
        const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        await withRLS((db) =>
          db.update(morningBriefGoogleTokens)
            .set({
              accessToken: encrypt(accessToken as string),
              tokenExpiresAt: expiresAt,
              updatedAt: new Date().toISOString(),
            })
            .where(and(eq(morningBriefGoogleTokens.id, tokenRow.id), eq(morningBriefGoogleTokens.userId, user.id)))
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // A revoked/expired refresh token can't be recovered — drop it so the
        // UI prompts a reconnect instead of failing forever.
        if (msg.includes('invalid_grant')) {
          await withRLS((db) =>
            db.delete(morningBriefGoogleTokens)
              .where(and(eq(morningBriefGoogleTokens.id, tokenRow.id), eq(morningBriefGoogleTokens.userId, user.id)))
          )
          return createErrorResponse('Your Google connection expired. Please reconnect Google Calendar.', 409)
        }
        console.error('morning-brief calendar refresh error:', msg)
        return createErrorResponse('Could not refresh Google access. Please try again.', 502)
      }
    }

    try {
      const events = await fetchTodaysEvents(accessToken, timezone)
      return NextResponse.json({ connected: true, events, timezone })
    } catch (err) {
      console.error('morning-brief calendar fetch error:', err instanceof Error ? err.message : err)
      return createErrorResponse('Could not load your Google Calendar. Please try again.', 502)
    }
  } catch (error) {
    console.error('GET /api/modules/morning-brief/calendar error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
