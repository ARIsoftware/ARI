/**
 * Public Route Handler Wrapper
 *
 * Provides a convenient wrapper for creating public (unauthenticated) API route handlers
 * with automatic security validation based on module.json configuration.
 *
 * Usage:
 * ```typescript
 * import { createPublicRouteHandler } from '@/lib/modules/public-route-handler'
 *
 * const securityConfig = {
 *   type: 'webhook_signature' as const,
 *   secretEnvVar: 'MY_WEBHOOK_SECRET',
 *   rateLimit: 100
 * }
 *
 * export const POST = createPublicRouteHandler(securityConfig, async (request, context) => {
 *   // Your handler logic here - security already validated
 *   const body = context.rawBody // Raw body available for webhook payload
 *   return NextResponse.json({ received: true })
 * })
 * ```
 */

import { NextRequest, NextResponse } from 'next/server'
import type { PublicRouteSecurity } from './module-types'
import { validatePublicRouteRequest } from './public-route-security'

/**
 * Context passed to the handler after security validation
 */
export interface PublicRouteContext {
  /** Raw request body (available after validation) */
  rawBody: string
  /** Route parameters from Next.js */
  params: Promise<Record<string, string | string[]>>
}

/**
 * Handler function type for public routes
 */
export type PublicRouteHandler = (
  request: NextRequest,
  context: PublicRouteContext
) => Promise<NextResponse>

/**
 * Creates a public route handler with automatic security validation
 *
 * @param securityConfig - Security configuration from module.json publicRoutes
 * @param handler - The actual route handler to execute after validation
 * @returns A Next.js route handler function
 */
export function createPublicRouteHandler(
  securityConfig: PublicRouteSecurity,
  handler: PublicRouteHandler
) {
  return async (
    request: NextRequest,
    routeContext?: { params: Promise<Record<string, string | string[]>> }
  ): Promise<NextResponse> => {
    try {
      // Read raw body for signature validation
      // Clone the request so we can read the body twice if needed
      const rawBody = await request.text()

      // Validate security
      const validationResult = await validatePublicRouteRequest(
        request,
        securityConfig,
        rawBody
      )

      if (!validationResult.valid) {
        console.warn(
          `[Public Route Handler] Security validation failed: ${validationResult.error}`
        )
        return NextResponse.json(
          { error: validationResult.error },
          { status: validationResult.status || 401 }
        )
      }

      // Create context with raw body and params
      const context: PublicRouteContext = {
        rawBody,
        params: routeContext?.params || Promise.resolve({})
      }

      // Execute the handler
      return await handler(request, context)
    } catch (error: any) {
      console.error('[Public Route Handler] Unhandled error:', error)
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}

/**
 * Creates a simple health check handler for public routes
 * Returns endpoint information without requiring authentication
 */
export function createPublicHealthCheck(
  endpoint: string,
  description: string
) {
  return async (): Promise<NextResponse> => {
    return NextResponse.json({
      status: 'ok',
      endpoint,
      description,
      timestamp: new Date().toISOString()
    })
  }
}
