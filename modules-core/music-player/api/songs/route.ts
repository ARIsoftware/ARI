import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import {
  validateRequestBody,
  validateQueryParams,
  createErrorResponse,
  toSnakeCase,
} from '@/lib/api-helpers'
import {
  createSongSchema as CreateSongSchema,
  updateSongSchema as UpdateSongSchema,
  songIdQuerySchema as IdQuerySchema,
  SongListResponseSchema,
  SongSingleResponseSchema,
  SuccessResponseSchema,
} from '@/modules/music-player/lib/validation'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { musicPlaylist } from '@/lib/db/schema'
import { and, eq, asc, sql } from 'drizzle-orm'

registry.registerPath({
  method: 'get',
  path: '/api/modules/music-player/songs',
  operationId: 'listSongs',
  summary: 'List the user\'s playlist songs in playback order',
  tags: ['music-player'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Songs ordered by position', content: { 'application/json': { schema: SongListResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/music-player/songs',
  operationId: 'addSong',
  summary: 'Append a new song to the end of the playlist',
  tags: ['music-player'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: CreateSongSchema } } } },
  responses: {
    201: { description: 'Created song', content: { 'application/json': { schema: SongSingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/modules/music-player/songs',
  operationId: 'deleteSong',
  summary: 'Delete a song by id (passed as query parameter)',
  tags: ['music-player'],
  security: DEFAULT_SECURITY,
  request: { query: IdQuerySchema },
  responses: {
    200: { description: 'Deletion acknowledged', content: { 'application/json': { schema: SuccessResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Song not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'put',
  path: '/api/modules/music-player/songs',
  operationId: 'updateSong',
  summary: "Update a song's title (id in query, title in body)",
  tags: ['music-player'],
  security: DEFAULT_SECURITY,
  request: {
    query: IdQuerySchema,
    body: { content: { 'application/json': { schema: UpdateSongSchema } } },
  },
  responses: {
    200: { description: 'Updated song', content: { 'application/json': { schema: SongSingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Song not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const songs = await withRLS((db) =>
      db
        .select()
        .from(musicPlaylist)
        .where(eq(musicPlaylist.userId, user.id))
        .orderBy(asc(musicPlaylist.position))
    )

    return NextResponse.json({ songs: toSnakeCase(songs) })
  } catch (error) {
    console.error('GET /api/modules/music-player/songs error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, CreateSongSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const { youtube_video_id, title } = validation.data

    const data = await withRLS(async (db) => {
      const maxPos = await db
        .select({ max: sql<number>`COALESCE(MAX(position), -1)` })
        .from(musicPlaylist)
        .where(eq(musicPlaylist.userId, user.id))
      const nextPosition = (maxPos[0]?.max ?? -1) + 1

      return db
        .insert(musicPlaylist)
        .values({
          userId: user.id,
          youtubeVideoId: youtube_video_id,
          title,
          position: nextPosition,
        })
        .returning()
    })

    return NextResponse.json({ song: toSnakeCase(data[0]) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/music-player/songs error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryValidation = validateQueryParams(searchParams, IdQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const deleted = await withRLS((db) =>
      db
        .delete(musicPlaylist)
        .where(and(eq(musicPlaylist.id, queryValidation.data.id), eq(musicPlaylist.userId, user.id)))
        .returning({ id: musicPlaylist.id })
    )

    if (deleted.length === 0) {
      return createErrorResponse('Song not found', 404)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/modules/music-player/songs error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queryValidation = validateQueryParams(searchParams, IdQuerySchema)
    if (!queryValidation.success) {
      return queryValidation.response
    }

    const validation = await validateRequestBody(request, UpdateSongSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized', 401)
    }

    const data = await withRLS((db) =>
      db
        .update(musicPlaylist)
        .set({ title: validation.data.title, updatedAt: sql`timezone('utc'::text, now())` })
        .where(and(eq(musicPlaylist.id, queryValidation.data.id), eq(musicPlaylist.userId, user.id)))
        .returning()
    )

    if (data.length === 0) {
      return createErrorResponse('Song not found', 404)
    }

    return NextResponse.json({ song: toSnakeCase(data[0]) })
  } catch (error) {
    console.error('PUT /api/modules/music-player/songs error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}
