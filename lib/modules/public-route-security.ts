/**
 * Public Route Security Helpers
 *
 * Primitives that public (unauthenticated) API routes use to enforce their own
 * security: in-memory sliding-window rate limiting, same-origin checking, and
 * client-IP extraction. Each public route imports what it needs and applies it
 * directly — see app/api/auth/bootstrap, app/api/onboarding/save-env, and
 * app/api/download-env.
 */

import { NextRequest } from 'next/server'

/**
 * In-memory rate limiter using sliding window
 * Key: identifier (IP or route), Value: { count, windowStart }
 */
const rateLimitStore = new Map<string, { count: number; windowStart: number }>()

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute window
  for (const [key, value] of rateLimitStore.entries()) {
    if (now - value.windowStart > windowMs * 2) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

/**
 * Check rate limit for a given identifier
 */
export function checkRateLimit(identifier: string, maxRequests: number): boolean {
  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute window

  const entry = rateLimitStore.get(identifier)

  if (!entry || now - entry.windowStart > windowMs) {
    // New window
    rateLimitStore.set(identifier, { count: 1, windowStart: now })
    return true
  }

  if (entry.count >= maxRequests) {
    return false
  }

  entry.count++
  return true
}

/**
 * Same-origin gate for public-during-setup endpoints.
 *
 * The presence-only Origin/Referer check used previously is bypassable: any
 * cross-origin browser request also carries an Origin header. We compare
 * against the server's own origin (and any configured app URLs) so a
 * malicious page on another origin can't drive `.env.local` writes or
 * bootstrap on the user's local instance.
 */
export function isSameOriginRequest(request: NextRequest): boolean {
  const trusted = new Set<string>()
  trusted.add(request.nextUrl.origin)
  for (const envVar of ['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL']) {
    const value = process.env[envVar]
    if (!value) continue
    try {
      trusted.add(new URL(value).origin)
    } catch { /* ignore malformed env */ }
  }

  const origin = request.headers.get('origin')
  if (origin && trusted.has(origin)) return true

  const referer = request.headers.get('referer')
  if (referer) {
    try {
      if (trusted.has(new URL(referer).origin)) return true
    } catch { /* malformed referer */ }
  }
  return false
}

/**
 * Get client IP from request
 */
export function getClientIp(request: NextRequest): string {
  // Check common headers for real IP (reverse proxy scenarios)
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  // Fallback - may not be accurate behind proxies
  return 'unknown'
}

