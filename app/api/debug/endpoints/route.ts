/**
 * Debug Endpoints API
 *
 * Returns information about all API endpoints in the system,
 * categorized by public (unauthenticated) and private (authenticated) routes.
 *
 * Endpoint: GET /api/debug/endpoints
 * Requires: Authentication
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import moduleManifest from '@/lib/generated/module-manifest.json'

// Import MODULE_API_ROUTES registry to get all private module routes
// We'll read this from the proxy route file indirectly
const MODULE_API_ROUTES: Record<string, Record<string, any>> = {
  'south-africa': {
    'tasks': { methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
    'activities': { methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
  },
  'hello-world': {
    'data': { methods: ['GET', 'POST', 'DELETE'] },
    'settings': { methods: ['GET', 'PUT'] }
  },
  'shipments': {
    'items': { methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
  },
  'hyrox': {
    'workouts': { methods: ['GET', 'POST'] },
    'workout-stations': { methods: ['GET', 'POST'] },
    'station-records': { methods: ['GET'] },
    'setup': { methods: ['POST'] },
    'reset': { methods: ['POST'] },
    'test-database': { methods: ['GET'] }
  },
  'quotes': {
    'quotes': { methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
    'settings': { methods: ['GET', 'PUT'] }
  },
  'contacts': {
    '': { methods: ['GET', 'POST'] },
    '[id]': { methods: ['GET', 'PATCH', 'DELETE'] }
  },
  'motivation': {
    'refresh-thumbnail': { methods: ['POST'] },
    'reorder': { methods: ['POST'] },
    'setup': { methods: ['POST'] }
  },
  'winter-arc': {
    '': { methods: ['GET', 'POST'] },
    '[id]': { methods: ['GET', 'PATCH', 'DELETE'] }
  },
  'major-projects': {
    'data': { methods: ['GET', 'POST'] },
    'data/[id]': { methods: ['PATCH', 'DELETE'] },
    'settings': { methods: ['GET', 'PUT'] }
  },
  'ohtani': {
    'data': { methods: ['GET', 'PUT'] }
  },
  'gratitude': {
    'entries': { methods: ['GET', 'POST'] }
  },
  'knowledge-manager': {
    'data': { methods: ['GET', 'POST'] },
    'data/[id]': { methods: ['GET', 'PATCH', 'DELETE'] },
    'collections': { methods: ['GET', 'POST'] },
    'collections/[id]': { methods: ['PATCH', 'DELETE'] }
  },
  'ari-launch': {
    'data': { methods: ['GET', 'POST'] }
  },
  'tasks': {
    '': { methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    'priorities': { methods: ['GET', 'PUT', 'POST'] },
    'analytics': { methods: ['GET'] },
    'increment-completion': { methods: ['POST'] },
    'last-completed': { methods: ['GET'] }
  },
  'memento': {
    'settings': { methods: ['GET', 'POST'] },
    'milestones': { methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
    'eras': { methods: ['GET', 'POST', 'PATCH', 'DELETE'] }
  },
  'mail-stream': {
    'webhook': { methods: ['GET', 'POST'] },
    'data': { methods: ['GET', 'DELETE'] },
    'settings': { methods: ['GET', 'PUT'] }
  }
}

interface PublicEndpoint {
  path: string
  fullPath: string
  moduleId: string
  methods: string[]
  securityType: string
  description?: string
  hasRateLimit: boolean
}

interface PrivateEndpoint {
  path: string
  fullPath: string
  moduleId: string
  methods: string[]
}

interface EndpointsResponse {
  publicEndpoints: PublicEndpoint[]
  privateEndpoints: PrivateEndpoint[]
  summary: {
    totalPublic: number
    totalPrivate: number
    modulesWithPublicRoutes: string[]
    securityCoverage: {
      webhookSignature: number
      apiKey: number
      rateLimitOnly: number
      ipAllowlist: number
      custom: number
    }
  }
  warnings: string[]
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Require authentication for debug endpoint
    const { user } = await getAuthenticatedUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Authentication required' },
        { status: 401 }
      )
    }

    // Get public routes from manifest
    const publicRoutes = (moduleManifest.publicRoutes || []) as Array<{
      moduleId: string
      path: string
      fullPath: string
      methods: string[]
      security: {
        type: string
        rateLimit?: number
      }
      description?: string
    }>

    // Build public endpoints list
    const publicEndpoints: PublicEndpoint[] = publicRoutes.map(route => ({
      path: route.path,
      fullPath: route.fullPath,
      moduleId: route.moduleId,
      methods: route.methods,
      securityType: route.security.type,
      description: route.description,
      hasRateLimit: !!route.security.rateLimit
    }))

    // Build private endpoints list from MODULE_API_ROUTES
    const privateEndpoints: PrivateEndpoint[] = []
    const publicRouteKeys = new Set(
      publicRoutes.map(r => `${r.moduleId}:${r.path}`)
    )

    for (const [moduleId, routes] of Object.entries(MODULE_API_ROUTES)) {
      for (const [path, config] of Object.entries(routes)) {
        // Skip routes that are configured as public
        const routeKey = `${moduleId}:${path}`
        if (publicRouteKeys.has(routeKey)) {
          continue
        }

        const fullPath = path
          ? `/api/modules/${moduleId}/${path}`
          : `/api/modules/${moduleId}`

        privateEndpoints.push({
          path: path || '(root)',
          fullPath,
          moduleId,
          methods: (config as any).methods || ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
        })
      }
    }

    // Calculate security coverage
    const securityCoverage = {
      webhookSignature: 0,
      apiKey: 0,
      rateLimitOnly: 0,
      ipAllowlist: 0,
      custom: 0
    }

    for (const endpoint of publicEndpoints) {
      switch (endpoint.securityType) {
        case 'webhook_signature':
          securityCoverage.webhookSignature++
          break
        case 'api_key':
          securityCoverage.apiKey++
          break
        case 'rate_limit_only':
          securityCoverage.rateLimitOnly++
          break
        case 'ip_allowlist':
          securityCoverage.ipAllowlist++
          break
        case 'custom':
          securityCoverage.custom++
          break
      }
    }

    // Generate warnings
    const warnings: string[] = []

    // Warn about rate_limit_only endpoints
    const rateLimitOnlyEndpoints = publicEndpoints.filter(
      e => e.securityType === 'rate_limit_only'
    )
    if (rateLimitOnlyEndpoints.length > 0) {
      warnings.push(
        `${rateLimitOnlyEndpoints.length} endpoint(s) use rate_limit_only security - consider adding stronger protection`
      )
    }

    // Warn about public endpoints without rate limiting
    const noRateLimitEndpoints = publicEndpoints.filter(
      e => !e.hasRateLimit && e.securityType !== 'rate_limit_only'
    )
    if (noRateLimitEndpoints.length > 0) {
      warnings.push(
        `${noRateLimitEndpoints.length} public endpoint(s) have no rate limiting configured`
      )
    }

    // Get unique modules with public routes
    const modulesWithPublicRoutes = [...new Set(publicEndpoints.map(e => e.moduleId))]

    const response: EndpointsResponse = {
      publicEndpoints,
      privateEndpoints,
      summary: {
        totalPublic: publicEndpoints.length,
        totalPrivate: privateEndpoints.length,
        modulesWithPublicRoutes,
        securityCoverage
      },
      warnings
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('[Debug Endpoints] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
