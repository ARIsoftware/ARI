/**
 * Public Route Security Validation
 *
 * Provides security validation for public (unauthenticated) module API routes.
 * All public routes MUST have security configuration - this is enforced at the type level.
 *
 * Supported security mechanisms:
 * - webhook_signature: Validates webhook signatures (Svix, Stripe, GitHub style)
 * - api_key: Validates API key in header
 * - rate_limit_only: Only applies rate limiting (use sparingly!)
 * - ip_allowlist: Restricts to specific IP addresses
 * - custom: Module handles its own validation (must document approach)
 */

import { NextRequest } from 'next/server'
import type { PublicRouteSecurity } from './module-types'

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

/**
 * Validate webhook signature using Svix library
 * Compatible with Resend, Svix, and similar webhook providers
 */
async function validateSvixSignature(
  request: NextRequest,
  rawBody: string,
  secret: string
): Promise<boolean> {
  try {
    // Dynamic import to avoid bundling issues if not used
    const { Webhook } = await import('svix')

    const svixId = request.headers.get('svix-id')
    const svixTimestamp = request.headers.get('svix-timestamp')
    const svixSignature = request.headers.get('svix-signature')

    if (!svixId || !svixTimestamp || !svixSignature) {
      return false
    }

    const wh = new Webhook(secret)
    wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    })

    return true
  } catch {
    return false
  }
}

/**
 * Validate Stripe-style webhook signature
 */
async function validateStripeSignature(
  request: NextRequest,
  rawBody: string,
  secret: string
): Promise<boolean> {
  try {
    const signature = request.headers.get('stripe-signature')
    if (!signature) {
      return false
    }

    // Parse signature header
    const elements = signature.split(',')
    let timestamp: string | null = null
    let v1Signature: string | null = null

    for (const element of elements) {
      const [key, value] = element.split('=')
      if (key === 't') timestamp = value
      if (key === 'v1') v1Signature = value
    }

    if (!timestamp || !v1Signature) {
      return false
    }

    // Check timestamp is within tolerance (5 minutes)
    const timestampNum = parseInt(timestamp, 10)
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - timestampNum) > 300) {
      return false
    }

    // Compute expected signature
    const crypto = await import('crypto')
    const payload = `${timestamp}.${rawBody}`
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')

    // Constant-time comparison
    return crypto.timingSafeEqual(
      Buffer.from(v1Signature),
      Buffer.from(expectedSignature)
    )
  } catch {
    return false
  }
}

/**
 * Validate GitHub-style webhook signature
 */
async function validateGitHubSignature(
  rawBody: string,
  secret: string,
  signatureHeader: string | null
): Promise<boolean> {
  try {
    if (!signatureHeader) {
      return false
    }

    const crypto = await import('crypto')

    // GitHub uses sha256 now (sha1 is deprecated)
    if (signatureHeader.startsWith('sha256=')) {
      const signature = signatureHeader.slice(7)
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex')

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    }

    // Legacy sha1 support
    if (signatureHeader.startsWith('sha1=')) {
      const signature = signatureHeader.slice(5)
      const expectedSignature = crypto
        .createHmac('sha1', secret)
        .update(rawBody)
        .digest('hex')

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      )
    }

    return false
  } catch {
    return false
  }
}

