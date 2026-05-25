import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import {
  reorderSongsSchema as ReorderSchema,
  SuccessResponseSchema,
} from '@/modules/music-player/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { musicPlaylist } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'

registry.registerPath({
  method: 'put',
  path: '/api/modules/music-player/songs/reorder',
  operationId: 'reorderSongs',
  summary: 'Reorder playlist songs by submitting the new ordered list of song ids',
  tags: ['music-player'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: ReorderSchema } } } },
  responses: {
    200: { description: 'Reorder applied', content: { 'application/json': { schema: SuccessResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function PUT(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, ReorderSchema)
    if (!validation.success) {
      return validation.response
    }
    const { orderedIds } = validation.data

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    await withRLS(async (db) => {
      await Promise.all(
        orderedIds.map((id, i) =>
          db
            .update(musicPlaylist)
            .set({ position: i, updatedAt: sql`timezone('utc'::text, now())` })
            .where(and(eq(musicPlaylist.id, id), eq(musicPlaylist.userId, user.id)))
        )
      )
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PUT /api/modules/music-player/songs/reorder error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
