import { NextRequest, NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { withAdminDb } from '@/lib/db'
import { appBranding } from '@/lib/db/schema'
import { registry } from '@/lib/openapi/registry'
import { ErrorResponseSchema } from '@/lib/openapi/common'
import { checkRateLimit, getClientIp } from '@/lib/modules/public-route-security'

registry.registerPath({
  method: 'get',
  path: '/api/branding/login-logo',
  operationId: 'getLoginLogo',
  summary: 'Serve the public login-screen logo (no auth). 200 with image bytes, or 404 when none is set.',
  description:
    'Intentionally public — shown on the sign-in page before authentication. Honors If-None-Match (304) and supports an immutable ?v=<updatedAt> cache-busting URL.',
  tags: ['app'],
  responses: {
    200: { description: 'Logo image bytes', content: { 'image/*': { schema: { type: 'string', format: 'binary' } } } },
    304: { description: 'Not modified (ETag matched If-None-Match)' },
    404: { description: 'No login logo configured', content: { 'application/json': { schema: ErrorResponseSchema } } },
    429: { description: 'Rate limit exceeded', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
})

// Generous per-IP cap. The sign-in page loads the logo once and then relies on
// the 304 / cache path, so a legitimate client (even a shared-NAT office) never
// approaches this — it only bounds a single-IP flood of the pre-auth endpoint.
const RATE_LIMIT_PER_MINUTE = 120

// PUBLIC endpoint — served to unauthenticated visitors on the sign-in page.
// Declared public via `isPublic` (picked up by generate-module-registry into the
// middleware manifest), so it needs no hand-edit in middleware's staticPublicRoutes.
// Returns the admin-configured login logo, or 404 when none is set (the sign-in
// page then hides the slot). The logo lives inline in the DB, independent of the
// storage provider.
export const isPublic = true
// Security contract for the /health public-endpoint tester (via the generated
// manifest): open by design — anonymous 200/404 responses are in-contract, the
// per-IP rate limit above is the only guard.
export const publicSecurity = 'rate_limit_only'
export const dynamic = 'force-dynamic'

// Short cache for the unversioned URL (the sign-in page): the browser revalidates
// after this window and we answer cheaply with 304 (see below). Callers that pass
// a content-addressed `?v=<updatedAt>` get an immutable long cache instead.
const CACHE_SHORT = 'public, max-age=60, must-revalidate'
const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable'
const CACHE_404 = 'public, max-age=60'

/** Weak-free ETag derived from the last-updated timestamp (changes on every save). */
function logoEtag(updatedAt: string | null): string {
  return `"${Buffer.from(updatedAt ?? '0').toString('base64')}"`
}

export async function GET(request: NextRequest) {
  // Throttle by client IP before touching the DB, so a flood can't amplify into
  // repeated reads/decodes of the pre-auth endpoint.
  if (!checkRateLimit(`login-logo:${getClientIp(request)}`, RATE_LIMIT_PER_MINUTE)) {
    return new NextResponse(null, { status: 429, headers: { 'Retry-After': '60' } })
  }

  // Metadata-only read first: presence + timestamp + type, WITHOUT pulling the
  // (up to ~8MB) base64 blob. This lets conditional requests short-circuit to a
  // 304 without ever reading or decoding the image.
  const meta = await withAdminDb((db) =>
    db
      .select({
        hasLogo: sql<boolean>`${appBranding.loginLogoData} IS NOT NULL`,
        updatedAt: appBranding.loginLogoUpdatedAt,
        contentType: appBranding.loginLogoContentType,
      })
      .from(appBranding)
      .where(eq(appBranding.id, 1))
      .limit(1)
  )
  const row = meta[0]

  if (!row?.hasLogo) {
    return new NextResponse(null, { status: 404, headers: { 'Cache-Control': CACHE_404 } })
  }

  const etag = logoEtag(row.updatedAt)
  const cacheControl = new URL(request.url).searchParams.has('v') ? CACHE_IMMUTABLE : CACHE_SHORT

  // Conditional request: the client already holds these exact bytes → 304, no
  // body, and (crucially) no second DB read / base64 decode.
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': cacheControl },
    })
  }

  // Cache miss (new client, or the logo changed): now read + decode the bytes.
  const dataRows = await withAdminDb((db) =>
    db
      .select({ data: appBranding.loginLogoData })
      .from(appBranding)
      .where(eq(appBranding.id, 1))
      .limit(1)
  )
  const base64 = dataRows[0]?.data
  if (!base64) {
    // Raced with a delete between the two reads — treat as no logo.
    return new NextResponse(null, { status: 404, headers: { 'Cache-Control': CACHE_404 } })
  }

  const buffer = Buffer.from(base64, 'base64')

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': row.contentType || 'application/octet-stream',
      'Content-Length': String(buffer.byteLength),
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': cacheControl,
      ETag: etag,
    },
  })
}
