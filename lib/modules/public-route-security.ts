/**
 * Public Route Security Helpers
 *
 * Primitives that public (unauthenticated) API routes use to enforce their own
 * security: in-memory sliding-window rate limiting, same-origin checking, and
 * client-IP extraction. Each public route imports what it needs and applies it
 * directly — see app/api/auth/bootstrap, app/api/download-env, and
 * app/api/setup/vercel-configure.
 */

import { NextRequest } from 'next/server'
import { isVercel } from '@/lib/deployment'

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

// Hostname is a literal address the browser dialed directly: localhost,
// IPv4, or bracketed IPv6. A DNS-rebinding attack needs an attacker-owned DNS
// NAME whose record flips to the victim's address — the browser then sends
// that name in Host/Origin. A literal-IP Host cannot be rebound, so trusting
// the request's own origin is safe exactly (and only) for these hosts.
function isDirectAddressHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return true
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true // IPv4 literal
  if (/^\[[0-9a-fA-F:.]+\]$/.test(hostname)) return true // bracketed IPv6 literal
  return false
}

/**
 * Same-origin gate for public-during-setup endpoints.
 *
 * Trusted origins are ONLY:
 *  - the configured app URLs (NEXT_PUBLIC_APP_URL / BETTER_AUTH_URL),
 *  - Vercel's own system hostnames (server-side env, not client-influenced),
 *  - the request's own origin when its host is a literal IP / localhost.
 *
 * The request's Host header is deliberately NOT trusted for DNS names:
 * deriving the trusted origin from the request itself made the check
 * attacker-controlled-vs-attacker-controlled — a DNS-rebinding page (Host and
 * Origin both `rebind.attacker.com` resolving to 127.0.0.1) sailed through
 * and could drive `.env.local` writes during the first-run window.
 */
export function isSameOriginRequest(request: NextRequest): boolean {
  const trusted = new Set<string>()
  if (isDirectAddressHost(request.nextUrl.hostname)) {
    trusted.add(request.nextUrl.origin)
  }
  for (const envVar of ['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL']) {
    const value = process.env[envVar]
    if (!value) continue
    try {
      trusted.add(new URL(value).origin)
    } catch { /* ignore malformed env */ }
  }
  // Vercel system hostnames cover the zero-env Deploy Button window, where no
  // app URL is configured yet. These come from the platform, never the client.
  for (const envVar of ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
    const host = process.env[envVar]
    if (host) trusted.add(`https://${host}`)
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
 * Get client IP for rate-limit bucketing.
 *
 * Proxy headers (X-Forwarded-For / X-Real-IP) are client-forgeable, so they
 * are honored ONLY when something trustworthy set them: the Vercel platform
 * (which overwrites X-Forwarded-For with the real client IP) or an operator
 * who declared a trusted reverse proxy via ARI_TRUST_PROXY=1. Anywhere else
 * the headers are ignored — otherwise one header per request buys an
 * attacker a fresh rate-limit bucket, turning every public-route limit into
 * a no-op.
 *
 * Without a trusted header source there is no per-client identity available
 * to a Next.js route handler, so all direct clients share one bucket
 * ('direct'). That is the pre-existing no-header behavior — the callers'
 * limits already account for it.
 */
export function getClientIp(request: NextRequest): string {
  const proxyHeadersTrusted = isVercel() || process.env.ARI_TRUST_PROXY === '1'

  if (proxyHeadersTrusted) {
    const forwardedFor = request.headers.get('x-forwarded-for')
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim()
    }
    const realIp = request.headers.get('x-real-ip')
    if (realIp) {
      return realIp
    }
  }

  // Direct exposure (no trusted proxy): a shared bucket is the only sound
  // option — better a coarse limit than a spoofable one.
  return 'direct'
}

