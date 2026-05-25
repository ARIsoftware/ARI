import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { brainstormBoards, brainstormNodes } from '@/lib/db/schema'
import { toSnakeCase } from '@/lib/api-helpers'
import { BrainstormStatsResponseSchema } from '@/modules/brainstorm/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'

registry.registerPath({
  method: 'get',
  path: '/api/modules/brainstorm/stats',
  operationId: 'getBrainstormStats',
  summary: 'Aggregate counts of brainstorm ideas (nodes) and boards for the user',
  tags: ['brainstorm'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Stats counters', content: { 'application/json': { schema: BrainstormStatsResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized - Valid authentication required' }, { status: 401 })
    }

    const [ideas, boards] = await Promise.all([
      withRLS((db) => db.select({ count: sql<number>`count(*)::int` }).from(brainstormNodes)),
      withRLS((db) => db.select({ count: sql<number>`count(*)::int` }).from(brainstormBoards)),
    ])

    return NextResponse.json(toSnakeCase({
      totalIdeasCreated: ideas[0]?.count || 0,
      totalBoards: boards[0]?.count || 0,
    }))
  } catch (error) {
    console.error('GET /api/modules/brainstorm/stats error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
