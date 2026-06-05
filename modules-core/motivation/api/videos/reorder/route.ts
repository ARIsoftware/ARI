/**
 * Motivation — reorder endpoint.
 *   POST /api/modules/motivation/videos/reorder { ids: [...] }
 *
 * Persists a new custom order by re-numbering the `position` column for
 * the user's rows. Implemented as a single SQL statement using a VALUES
 * list so it's one round-trip regardless of the playlist size.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { reorderSchema, ReorderResponseSchema } from '@/modules/motivation/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { motivationVideos } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'

registry.registerPath({
  method: 'post',
  path: '/api/modules/motivation/videos/reorder',
  operationId: 'reorderMotivationVideos',
  summary: "Set the custom play order for the user's videos",
  tags: ['motivation'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: reorderSchema } } } },
  responses: {
    200: { description: 'Order saved', content: { 'application/json': { schema: ReorderResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, reorderSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const { ids } = validation.data

    // Build `(id, position)` tuples. Each ${id} is parameterized by Drizzle
    // (so no injection); `::uuid` casts the bound text param to uuid in pg.
    // Zod already validated ids as UUIDs.
    const tuples = ids.map((id, index) => sql`(${id}::uuid, ${index + 1})`)

    await withRLS((db) =>
      db.execute(sql`
        UPDATE ${motivationVideos} AS m
        SET position = v.position, updated_at = NOW()
        FROM (VALUES ${sql.join(tuples, sql`, `)}) AS v(id, position)
        WHERE m.id = v.id
          AND m.user_id = ${user.id}
      `),
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/modules/motivation/videos/reorder error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
