/**
 * Debug Endpoints API
 *
 * Returns all API endpoints discovered at build time from the module manifest.
 * Includes core routes (app/api/), module routes, and public routes with security info.
 *
 * Endpoint: GET /api/debug/endpoints
 * Requires: Authentication
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import moduleManifest from '@/lib/generated/module-manifest.json'

export const debugRole = "debug-endpoints"

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Authentication required' },
        { status: 401 }
      )
    }

    const coreRoutes = (moduleManifest as any).coreApiRoutes || []
    const moduleRoutes = (moduleManifest as any).moduleApiRoutes || []

    // Public routes from manifest
    const publicRoutes = (moduleManifest.publicRoutes || []) as Array<{
      moduleId: string
      path: string
      fullPath: string
      methods: string[]
      security: { type: string; rateLimit?: number | boolean; requiresAuthIfUsers?: boolean }
      description?: string
    }>

    const publicEndpoints = publicRoutes.map(route => ({
      path: route.path,
      fullPath: route.fullPath,
      moduleId: route.moduleId,
      methods: route.methods,
      securityType: route.security.type,
      description: route.description,
      hasRateLimit: !!route.security.rateLimit,
      requiresAuthIfUsers: !!route.security.requiresAuthIfUsers,
    }))

    // Private module endpoints (exclude public ones)
    const publicRouteKeys = new Set(publicRoutes.map(r => `${r.moduleId}:${r.path}`))
    const privateModuleEndpoints = moduleRoutes.filter((r: any) => {
      const routeKey = `${r.moduleId}:${r.path === '(root)' ? '' : r.path}`
      return !publicRouteKeys.has(routeKey)
    })

    // Security coverage stats
    const securityCoverage: Record<string, number> = {}
    for (const ep of publicEndpoints) {
      securityCoverage[ep.securityType] = (securityCoverage[ep.securityType] || 0) + 1
    }

    // Warnings
    const warnings: string[] = []
    const rateLimitOnly = publicEndpoints.filter(e => e.securityType === 'rate_limit_only')
    if (rateLimitOnly.length > 0) {
      warnings.push(`${rateLimitOnly.length} endpoint(s) use rate_limit_only security - consider adding stronger protection`)
    }
    const noRateLimit = publicEndpoints.filter(e => !e.hasRateLimit && e.securityType !== 'rate_limit_only')
    if (noRateLimit.length > 0) {
      warnings.push(`${noRateLimit.length} public endpoint(s) have no rate limiting configured`)
    }

    const modulesWithPublicRoutes = [...new Set(publicEndpoints.map(e => e.moduleId))]

    return NextResponse.json({
      coreEndpoints: coreRoutes,
      moduleEndpoints: privateModuleEndpoints,
      publicEndpoints,
      summary: {
        totalCore: coreRoutes.length,
        totalModule: privateModuleEndpoints.length,
        totalPublic: publicEndpoints.length,
        totalPrivate: coreRoutes.length + privateModuleEndpoints.length,
        modulesWithPublicRoutes,
        securityCoverage,
      },
      warnings,
    })
  } catch (error: unknown) {
    console.error('[Debug Endpoints] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
