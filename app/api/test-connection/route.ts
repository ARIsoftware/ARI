import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { safeErrorResponse } from '@/lib/api-error'
import { pool } from '@/lib/db/pool'
import { TestConnectionResponseSchema } from '@/lib/openapi/app-schemas'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, UnauthorizedResponse } from '@/lib/openapi/common'

export const debugRole = "test-connection"

registry.registerPath({
  method: 'get',
  path: '/api/test-connection',
  operationId: 'testDbConnection',
  summary: 'One-shot database connectivity test (SELECT 1)',
  tags: ['app'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Test result (success or error in the JSON body — always HTTP 200)', content: { 'application/json': { schema: TestConnectionResponseSchema } } },
    401: UnauthorizedResponse,
  },
})

export async function GET() {
  // Require authentication for this diagnostic endpoint
  const { user } = await getAuthenticatedUser()

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      success: false,
      error: 'Missing DATABASE_URL environment variable'
    })
  }

  try {
    if (!pool) {
      return NextResponse.json({
        success: false,
        error: 'Database pool not initialized'
      })
    }
    const client = await pool.connect()
    try {
      await client.query('SELECT 1')
      return NextResponse.json({
        success: true,
        status: 200,
        statusText: 'Connected',
      })
    } finally {
      client.release()
    }
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: safeErrorResponse(error),
    })
  }
}
