/**
 * Module API Catch-All Route
 *
 * Dynamically imports and executes module API handlers using a registry pattern.
 * Proxies requests to module API routes in /modules/[module]/api/
 *
 * URL Pattern: /api/modules/[module]/[[...path]]
 * Examples:
 *   /api/modules/contacts → /modules/contacts/api/route.ts
 *   /api/modules/contacts/123 → /modules/contacts/api/[id]/route.ts
 *   /api/modules/hello-world/data → /modules/hello-world/api/data/route.ts
 *
 * IMPORTANT: This uses a registry-based approach since Next.js/Turbopack cannot
 * resolve dynamic imports with runtime-constructed paths. When adding a new module
 * API route, you must register it in the MODULE_API_ROUTES object below.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getEnabledModule } from '@/lib/modules/module-registry'

/**
 * Module API Routes Registry
 *
 * Maps module IDs and API paths to their corresponding route handlers.
 * This registry uses static import paths that can be analyzed at build time.
 *
 * Pattern: { 'module-id': { 'api-path': () => import('@/modules/module-id/api/api-path/route') } }
 *
 * When adding a new module with API routes:
 * 1. Add the module ID as a key
 * 2. For each API route in /modules/[module]/api/[route]/, add an entry
 * 3. Use the folder name as the key (e.g., 'data' for /api/data/)
 * 4. Use static import path: () => import('@/modules/[module]/api/[route]/route')
 */
const MODULE_API_ROUTES: Record<string, Record<string, any>> = {
  'south-africa': {
    'tasks': () => import('@/modules/south-africa/api/tasks/route')
  },
  'hello-world': {
    'data': () => import('@/modules/hello-world/api/data/route'),
    'settings': () => import('@/modules/hello-world/api/settings/route')
  },
  'shipments': {
    'items': () => import('@/modules/shipments/api/items/route')
  },
  'hyrox': {
    'workouts': () => import('@/modules/hyrox/api/workouts/route'),
    'workout-stations': () => import('@/modules/hyrox/api/workout-stations/route'),
    'station-records': () => import('@/modules/hyrox/api/station-records/route'),
    'setup': () => import('@/modules/hyrox/api/setup/route'),
    'reset': () => import('@/modules/hyrox/api/reset/route'),
    'test-database': () => import('@/modules/hyrox/api/test-database/route')
  },
  'quotes': {
    'quotes': () => import('@/modules/quotes/api/quotes/route'),
    'settings': () => import('@/modules/quotes/api/settings/route')
  },
  'contacts': {
    '': () => import('@/modules/contacts/api/route'), // Base route for list/create
    '[id]': () => import('@/modules/contacts/api/[id]/route') // Dynamic ID route
  },
  'motivation': {
    'refresh-thumbnail': () => import('@/modules/motivation/api/refresh-thumbnail/route'),
    'reorder': () => import('@/modules/motivation/api/reorder/route'),
    'setup': () => import('@/modules/motivation/api/setup/route')
  },
  'winter-arc': {
    '': () => import('@/modules/winter-arc/api/route'), // Base route for list/create
    '[id]': () => import('@/modules/winter-arc/api/[id]/route') // Dynamic ID route
  },
  'major-projects': {
    'data': () => import('@/modules/major-projects/api/data/route'), // GET/POST for list/create
    'data/[id]': () => import('@/modules/major-projects/api/data/[id]/route'), // PATCH/DELETE for update/delete
    'settings': () => import('@/modules/major-projects/api/settings/route') // Settings GET/PUT
  },
  'ohtani': {
    'data': () => import('@/modules/ohtani/api/data/route') // GET/PUT for grid cells
  }
}

/**
 * Handle API requests using the MODULE_API_ROUTES registry
 */
async function handleRequest(
  request: NextRequest,
  method: string,
  params: Promise<{ module: string; path?: string[] }>
) {
  const { module, path } = await params

  try {
    // Validate module exists and is enabled for current user
    const moduleInfo = await getEnabledModule(module)
    if (!moduleInfo) {
      return NextResponse.json(
        { error: 'Module not found or not enabled' },
        { status: 404 }
      )
    }

    // Build API path from segments (e.g., ['items'] -> 'items', undefined -> '')
    const pathArray = path || []
    const apiPath = pathArray.join('/')

    // Look up module in registry
    const moduleRoutes = MODULE_API_ROUTES[module]
    if (!moduleRoutes) {
      console.error(`[Module API] Module '${module}' not found in registry`)
      return NextResponse.json(
        { error: `API routes not registered for module: ${module}` },
        { status: 404 }
      )
    }

    // Look up specific route in module
    // Handle empty path (base route), named routes, and dynamic [id] routes
    let routeLoader = moduleRoutes[apiPath]
    let dynamicParams: any = null // Track if we need to transform params

    // If not found and path has single segment, try [id] route for dynamic IDs
    if (!routeLoader && pathArray.length === 1 && moduleRoutes['[id]']) {
      routeLoader = moduleRoutes['[id]']
      // Transform params: { module, path: ['uuid'] } -> { id: 'uuid' }
      dynamicParams = Promise.resolve({ id: pathArray[0] })
    }

    // If not found and path has multiple segments, try nested dynamic routes
    // Example: ['data', '123'] -> try 'data/[id]'
    if (!routeLoader && pathArray.length > 1) {
      // Replace last segment with [id] and try that pattern
      const patternPath = [...pathArray.slice(0, -1), '[id]'].join('/')
      if (moduleRoutes[patternPath]) {
        routeLoader = moduleRoutes[patternPath]
        // Transform params: { module, path: ['data', 'uuid'] } -> { id: 'uuid' }
        dynamicParams = Promise.resolve({ id: pathArray[pathArray.length - 1] })
      }
    }

    // If still not found and path is empty, try empty string route
    if (!routeLoader && pathArray.length === 0 && moduleRoutes['']) {
      routeLoader = moduleRoutes['']
    }

    if (!routeLoader) {
      console.error(`[Module API] Route '${apiPath}' not found in module '${module}' registry`)
      return NextResponse.json(
        { error: `API route not found: /api/modules/${module}/${apiPath}` },
        { status: 404 }
      )
    }

    // Load the route handler using the static import
    const handler = await routeLoader()

    // Check if the HTTP method is supported by this handler
    if (!handler[method]) {
      return NextResponse.json(
        { error: `Method ${method} not allowed` },
        { status: 405 }
      )
    }

    // Execute the appropriate HTTP method handler
    // Pass both request and context (context contains params for module handler to use)
    // Module handlers receive: (request: NextRequest, context: { params: Promise<RouteParams> })
    // If we detected a dynamic route, pass transformed params, otherwise pass original
    return await handler[method](request, { params: dynamicParams || params })
  } catch (error: any) {
    // Log error for debugging
    console.error(`[Module API ${module}/${path.join('/')}] Error:`, error)

    // Generic error response
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET handler
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; path?: string[] }> }
) {
  return handleRequest(request, 'GET', params)
}

/**
 * POST handler
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; path?: string[] }> }
) {
  return handleRequest(request, 'POST', params)
}

/**
 * PUT handler
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; path?: string[] }> }
) {
  return handleRequest(request, 'PUT', params)
}

/**
 * DELETE handler
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; path?: string[] }> }
) {
  return handleRequest(request, 'DELETE', params)
}

/**
 * PATCH handler
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; path?: string[] }> }
) {
  return handleRequest(request, 'PATCH', params)
}
