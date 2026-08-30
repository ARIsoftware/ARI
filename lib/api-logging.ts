/**
 * Request logging for core API routes.
 *
 * `recordApiKeyUsage()` was historically called only from the module proxy
 * (`app/api/modules/[module]/[[...path]]/route.ts`), so every core route was
 * invisible in Settings → API: `last_used_at` and `request_count` under-reported,
 * and the most sensitive surface in the app (backup export, storage, api-keys)
 * had no audit trail at all.
 *
 * A wrapper at the export site is the only shape that can see the response
 * status. Middleware runs strictly before the handler and returns
 * `NextResponse.next()` without ever observing the outcome, and
 * `getAuthenticatedUser()` is React-`cache`d, fires pre-handler, and has no
 * access to the method or path.
 *
 * Scope: API-key requests only. Session-authenticated traffic is deliberately
 * not logged — it is browser-rate rather than machine-rate, and logging it is a
 * volume decision to make separately.
 */

import { NextRequest, after } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { hashApiKey, lookupApiKey, recordApiKeyUsage } from '@/lib/api-keys'
import { pruneUsageLogs, shouldPrune } from '@/lib/api-log-retention'

/** Identity of the API key behind a request, once resolved. */
interface ApiKeyIdentity {
  id: string
  userId: string
  ipAddress: string | null
  userAgent: string | null
}

/** A Next.js route handler, with or without a route-context argument. */
type RouteHandler<C> = (request: NextRequest, context: C) => Promise<Response> | Response

/** First hop of x-forwarded-for, then x-real-ip. Mirrors auth-helpers. */
function clientIpFrom(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  )
}

/**
 * Resolve the API key behind this request, or null if there isn't one.
 *
 * Prefers the auth result — `getAuthenticatedUser()` is memoized per request,
 * so the handler's own call is reused and this costs no extra round trip. Falls
 * back to a direct key lookup so requests rejected before/at auth (a valid key
 * from a non-allowlisted IP, a disabled account) are still attributed to their
 * owner, matching `recordUsageByKeyValue()` in the module proxy.
 */
async function resolveApiKey(
  request: NextRequest,
  rawKey: string
): Promise<ApiKeyIdentity | null> {
  const auth = await getAuthenticatedUser()
  if ('apiKey' in auth && auth.apiKey) return auth.apiKey as ApiKeyIdentity

  // Auth failed but a key was presented — attribute it if the key is real, so
  // the owner can see probes against their key.
  const keyRow = await lookupApiKey(hashApiKey(rawKey))
  if (!keyRow) return null

  return {
    id: keyRow.id,
    userId: keyRow.userId,
    ipAddress: clientIpFrom(request),
    userAgent: request.headers.get('user-agent'),
  }
}

/**
 * Run work after the response is sent; fall back to fire-and-forget when called
 * outside a request scope (`after()` throws there). Both paths swallow errors —
 * a logging failure must never affect the request. Same idiom as
 * `lib/activity-log.ts`.
 */
function schedule(work: () => Promise<unknown>): void {
  const run = () =>
    work().catch((err) => {
      console.error('API request log failed:', err)
    })
  try {
    after(run)
  } catch {
    void run()
  }
}

/**
 * Wrap a core route handler so API-key requests are recorded to
 * `api_key_usage_logs`.
 *
 * The handler runs untouched and its response is returned unchanged; logging
 * happens after the response flushes. A sampled fraction of writes also prunes
 * the caller's expired rows (see `lib/api-log-retention.ts`).
 *
 *   export const GET = withApiLogging(async (request) => { ... })
 */
export function withApiLogging<C = unknown>(handler: RouteHandler<C>): RouteHandler<C> {
  return async (request: NextRequest, context: C): Promise<Response> => {
    // Cheap pre-check: no key header means nothing to log, so skip entirely
    // rather than paying for an after() callback on every session request.
    const rawKey = request.headers.get('x-api-key')

    let response: Response
    try {
      response = await handler(request, context)
    } catch (err) {
      // Record the failure before rethrowing, so a throwing handler doesn't
      // create a silent gap in the audit trail.
      if (rawKey) {
        logRequest(request, 500, rawKey)
      }
      throw err
    }

    if (rawKey) {
      logRequest(request, response.status, rawKey)
    }
    return response
  }
}

/** Schedule the usage-log write (and possibly a prune) for one request. */
function logRequest(request: NextRequest, statusCode: number, rawKey: string): void {
  const endpoint = request.nextUrl.pathname
  const method = request.method

  schedule(async () => {
    const key = await resolveApiKey(request, rawKey)
    if (!key) return

    // Awaited (not fire-and-forget) because we are already inside after() —
    // letting the promise float here would let the runtime cut the write off.
    await recordApiKeyUsage({
      apiKeyId: key.id,
      userId: key.userId,
      endpoint,
      method,
      statusCode,
      ipAddress: key.ipAddress,
      userAgent: key.userAgent,
    })

    if (shouldPrune()) {
      await pruneUsageLogs(key.userId)
    }
  })
}
