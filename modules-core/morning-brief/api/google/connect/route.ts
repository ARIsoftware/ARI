/**
 * Morning Brief Module - Google OAuth: start
 *
 * GET /api/modules/morning-brief/google/connect
 *
 * A top-level browser navigation (the "Connect Google Calendar" button points
 * here). Generates a CSRF state value, stores it in a short-lived httpOnly
 * cookie, and 302-redirects the user to Google's consent screen.
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { getGoogleConfig, buildAuthUrl, OAUTH_STATE_COOKIE } from '@/modules/morning-brief/lib/google'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, UnauthorizedResponse } from '@/lib/openapi/common'

export const dynamic = 'force-dynamic'

registry.registerPath({
  method: 'get',
  path: '/api/modules/morning-brief/google/connect',
  operationId: 'startMorningBriefGoogleOAuth',
  summary: 'Begin the Google Calendar OAuth flow (redirects to Google)',
  tags: ['morning-brief'],
  security: DEFAULT_SECURITY,
  responses: {
    302: { description: 'Redirect to Google consent screen (or back to settings on error)' },
    401: UnauthorizedResponse,
  },
})

export async function GET(request: NextRequest) {
  const settingsUrl = new URL('/morning-brief/settings', request.nextUrl.origin)

  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.redirect(new URL('/sign-in', request.nextUrl.origin))
  }

  const config = getGoogleConfig()
  if (!config) {
    settingsUrl.searchParams.set('google_error', 'not_configured')
    return NextResponse.redirect(settingsUrl)
  }

  const state = randomBytes(16).toString('hex')
  const authUrl = buildAuthUrl(config.clientId, state)

  const res = NextResponse.redirect(authUrl)
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes to complete consent
  })
  return res
}
