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
 * Result of security validation
 */
export interface SecurityValidationResult {
  valid: boolean
  error?: string
  status?: number // HTTP status code for error response
}

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

/**
 * Validate public route request against security configuration
 *
 * @param request - The incoming NextRequest
 * @param config - Security configuration from module.json
 * @param rawBody - Raw request body (required for signature validation)
 * @returns Validation result with error details if invalid
 */
export async function validatePublicRouteRequest(
  request: NextRequest,
  config: PublicRouteSecurity,
  rawBody?: string
): Promise<SecurityValidationResult> {
  const clientIp = getClientIp(request)

  // Apply rate limiting if configured (applies to all security types)
  if (config.rateLimit) {
    const rateLimitKey = `${request.nextUrl.pathname}:${clientIp}`
    if (!checkRateLimit(rateLimitKey, config.rateLimit)) {
      console.warn(`[Public Route Security] Rate limit exceeded for ${rateLimitKey}`)
      return {
        valid: false,
        error: 'Rate limit exceeded. Please try again later.',
        status: 429
      }
    }
  }

  switch (config.type) {
    case 'webhook_signature': {
      if (!config.secretEnvVar) {
        console.error('[Public Route Security] webhook_signature requires secretEnvVar')
        return {
          valid: false,
          error: 'Server configuration error',
          status: 500
        }
      }

      const secret = process.env[config.secretEnvVar]
      if (!secret) {
        console.error(`[Public Route Security] Environment variable ${config.secretEnvVar} not set`)
        return {
          valid: false,
          error: 'Webhook secret not configured',
          status: 500
        }
      }

      if (!rawBody) {
        return {
          valid: false,
          error: 'Missing request body for signature validation',
          status: 400
        }
      }

      // Try Svix signature first (most common for modern webhooks like Resend)
      if (request.headers.get('svix-id')) {
        const valid = await validateSvixSignature(request, rawBody, secret)
        if (!valid) {
          console.warn('[Public Route Security] Svix signature validation failed')
          return {
            valid: false,
            error: 'Invalid webhook signature',
            status: 401
          }
        }
        return { valid: true }
      }

      // Try Stripe signature
      if (request.headers.get('stripe-signature')) {
        const valid = await validateStripeSignature(request, rawBody, secret)
        if (!valid) {
          console.warn('[Public Route Security] Stripe signature validation failed')
          return {
            valid: false,
            error: 'Invalid webhook signature',
            status: 401
          }
        }
        return { valid: true }
      }

      // Try GitHub signature
      const ghSignature = request.headers.get('x-hub-signature-256') ||
                          request.headers.get('x-hub-signature')
      if (ghSignature) {
        const valid = await validateGitHubSignature(rawBody, secret, ghSignature)
        if (!valid) {
          console.warn('[Public Route Security] GitHub signature validation failed')
          return {
            valid: false,
            error: 'Invalid webhook signature',
            status: 401
          }
        }
        return { valid: true }
      }

      // No recognized signature headers
      console.warn('[Public Route Security] No webhook signature headers found')
      return {
        valid: false,
        error: 'Missing webhook signature headers',
        status: 400
      }
    }

    case 'api_key': {
      if (!config.apiKeyEnvVar) {
        console.error('[Public Route Security] api_key requires apiKeyEnvVar')
        return {
          valid: false,
          error: 'Server configuration error',
          status: 500
        }
      }

      const expectedKey = process.env[config.apiKeyEnvVar]
      if (!expectedKey) {
        console.error(`[Public Route Security] Environment variable ${config.apiKeyEnvVar} not set`)
        return {
          valid: false,
          error: 'API key not configured',
          status: 500
        }
      }

      const headerName = config.apiKeyHeader || 'x-api-key'
      const providedKey = request.headers.get(headerName)

      if (!providedKey) {
        return {
          valid: false,
          error: `Missing API key in ${headerName} header`,
          status: 401
        }
      }

      // Constant-time comparison to prevent timing attacks
      const crypto = await import('crypto')
      try {
        const valid = crypto.timingSafeEqual(
          Buffer.from(providedKey),
          Buffer.from(expectedKey)
        )
        if (!valid) {
          console.warn('[Public Route Security] Invalid API key')
          return {
            valid: false,
            error: 'Invalid API key',
            status: 401
          }
        }
      } catch {
        // Buffer lengths don't match
        return {
          valid: false,
          error: 'Invalid API key',
          status: 401
        }
      }

      return { valid: true }
    }

    case 'ip_allowlist': {
      if (!config.allowedIps || config.allowedIps.length === 0) {
        console.error('[Public Route Security] ip_allowlist requires allowedIps array')
        return {
          valid: false,
          error: 'Server configuration error',
          status: 500
        }
      }

      if (!config.allowedIps.includes(clientIp)) {
        console.warn(`[Public Route Security] IP ${clientIp} not in allowlist`)
        return {
          valid: false,
          error: 'Access denied',
          status: 403
        }
      }

      return { valid: true }
    }

    case 'rate_limit_only': {
      // Rate limiting already applied above
      // This type allows public access with only rate limiting protection
      // Use sparingly and only for truly public endpoints!
      return { valid: true }
    }

    case 'custom': {
      // Custom security - module must handle validation itself
      // This is a pass-through; the module's route handler must validate
      console.info('[Public Route Security] Custom security - module must handle validation')
      return { valid: true }
    }

    default:
      console.error(`[Public Route Security] Unknown security type: ${(config as any).type}`)
      return {
        valid: false,
        error: 'Invalid security configuration',
        status: 500
      }
  }
}

/**
 * Check if a route is configured as public for a given module
 */
export function isPublicRoute(
  moduleId: string,
  path: string,
  method: string,
  publicRoutes: Array<{ moduleId: string; path: string; methods: string[] }>
): boolean {
  return publicRoutes.some(
    route =>
      route.moduleId === moduleId &&
      route.path === path &&
      route.methods.includes(method.toUpperCase())
  )
}
