/**
 * Morning Brief Module - Google OAuth: callback
 *
 * GET /api/modules/morning-brief/google/callback
 *
 * Google redirects here after consent. Validates the CSRF state cookie,
 * exchanges the code for tokens, discovers the connected account's email, and
 * stores the (encrypted) tokens scoped to the authenticated user. Always ends
 * by redirecting back to the module's settings page with a status flag.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import {
  getGoogleConfig,
  exchangeCodeForTokens,
  fetchPrimaryCalendarEmail,
  OAUTH_STATE_COOKIE,
} from '@/modules/morning-brief/lib/google'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, UnauthorizedResponse } from '@/lib/openapi/common'
import { morningBriefGoogleTokens } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { encrypt, decrypt } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

registry.registerPath({
  method: 'get',
  path: '/api/modules/morning-brief/google/callback',
  operationId: 'completeMorningBriefGoogleOAuth',
  summary: 'Google OAuth callback — exchanges the code and stores tokens',
  tags: ['morning-brief'],
  security: DEFAULT_SECURITY,
  responses: {
    302: { description: 'Redirect back to Morning Brief settings with a status flag' },
    401: UnauthorizedResponse,
  },
})

export async function GET(request: NextRequest) {
  const settingsUrl = new URL('/morning-brief/settings', request.nextUrl.origin)
  const fail = (reason: string) => {
    settingsUrl.searchParams.set('google_error', reason)
    const res = NextResponse.redirect(settingsUrl)
    res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 })
    return res
  }

  const { user, withRLS } = await getAuthenticatedUser()
  if (!user || !withRLS) {
    return NextResponse.redirect(new URL('/sign-in', request.nextUrl.origin))
  }

  const params = request.nextUrl.searchParams
  if (params.get('error')) {
    return fail('access_denied')
  }

  const code = params.get('code')
  const state = params.get('state')
  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value
  if (!code || !state || !cookieState || state !== cookieState) {
    return fail('state')
  }

  const config = getGoogleConfig()
  if (!config) {
    return fail('not_configured')
  }

  try {
    const tokens = await exchangeCodeForTokens(config, code)

    // Reuse the existing refresh token if Google didn't issue a fresh one.
    const existing = await withRLS((db) =>
      db.select().from(morningBriefGoogleTokens)
        .where(eq(morningBriefGoogleTokens.userId, user.id))
        .limit(1)
    )
    const refreshToken = tokens.refresh_token
      ?? (existing[0]?.refreshToken ? decrypt(existing[0].refreshToken) : null)
    if (!refreshToken) {
      return fail('no_refresh_token')
    }

    const email = await fetchPrimaryCalendarEmail(tokens.access_token)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    await withRLS((db) =>
      db.insert(morningBriefGoogleTokens)
        .values({
          userId: user.id,
          accessToken: encrypt(tokens.access_token),
          refreshToken: encrypt(refreshToken),
          tokenExpiresAt: expiresAt,
          googleEmail: email,
          scope: tokens.scope ?? null,
        })
        .onConflictDoUpdate({
          target: [morningBriefGoogleTokens.userId],
          set: {
            accessToken: encrypt(tokens.access_token),
            refreshToken: encrypt(refreshToken),
            tokenExpiresAt: expiresAt,
            googleEmail: email,
            scope: tokens.scope ?? null,
            updatedAt: new Date().toISOString(),
          },
        })
    )

    settingsUrl.searchParams.set('google', 'connected')
    const res = NextResponse.redirect(settingsUrl)
    res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 })
    return res
  } catch (err) {
    console.error('morning-brief google callback error:', err instanceof Error ? err.message : err)
    return fail('exchange_failed')
  }
}
