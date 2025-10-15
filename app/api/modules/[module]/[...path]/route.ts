/**
 * Module API Catch-All Route
 *
 * Dynamically imports and executes module API handlers.
 * Proxies requests to module API routes in /modules/[module]/api/
 *
 * URL Pattern: /api/modules/[module]/[...path]
 * Example: /api/modules/hello-world/data → /modules/hello-world/api/data/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { getEnabledModule } from '@/lib/modules/module-registry'

/**
 * Handle API requests by dynamically importing module handlers
 */
async function handleRequest(
  request: NextRequest,
  method: string,
  params: Promise<{ module: string; path: string[] }>
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

    // Build relative path to module API handler
    // IMPORTANT: Must use relative paths, not @/ alias
    // Dynamic imports require actual filesystem paths
    const apiPath = path.join('/')
    const handlerPath = `../../../../../../modules/${module}/api/${apiPath}/route`

    // Dynamically import the module's API handler
    const handler = await import(/* @vite-ignore */ handlerPath)

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
    return await handler[method](request, { params })
  } catch (error: any) {
    // Log error for debugging
    console.error(`[Module API ${module}/${path.join('/')}] Error:`, error)

    // Check if it's a module not found error (import failed)
    if (error.code === 'MODULE_NOT_FOUND' || error.message?.includes('Cannot find module')) {
      return NextResponse.json(
        { error: `API route not found: /api/modules/${module}/${path.join('/')}` },
        { status: 404 }
      )
    }

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
  { params }: { params: Promise<{ module: string; path: string[] }> }
) {
  return handleRequest(request, 'GET', params)
}

/**
 * POST handler
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; path: string[] }> }
) {
  return handleRequest(request, 'POST', params)
}

/**
 * PUT handler
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; path: string[] }> }
) {
  return handleRequest(request, 'PUT', params)
}

/**
 * DELETE handler
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; path: string[] }> }
) {
  return handleRequest(request, 'DELETE', params)
}

/**
 * PATCH handler
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; path: string[] }> }
) {
  return handleRequest(request, 'PATCH', params)
}
