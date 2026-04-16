import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import {
  validateRequestBody,
  validateQueryParams,
  createErrorResponse,
  toSnakeCase,
} from '@/lib/api-helpers'
import { z } from 'zod'
import { musicPlaylist } from '@/lib/db/schema'
import { and, eq, asc, sql } from 'drizzle-orm'

const YOUTUBE_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/

const CreateSongSchema = z.object({
  youtube_video_id: z
    .string()
    .regex(YOUTUBE_VIDEO_ID_REGEX, 'Invalid YouTube video ID (must be 11 characters: A-Z, a-z, 0-9, _ or -)'),
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or less'),
})

const UpdateSongSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or less'),
})

const IdQuerySchema = z.object({
  id: z.string().uuid('Invalid song id format'),
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
