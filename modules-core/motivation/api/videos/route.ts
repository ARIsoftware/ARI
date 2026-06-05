/**
 * Motivation — videos collection endpoint.
 *   GET  /api/modules/motivation/videos  → list current user's videos
 *   POST /api/modules/motivation/videos  → add a video by YouTube URL
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse, toSnakeCase } from '@/lib/api-helpers'
import {
  addVideoSchema,
  VideoListResponseSchema,
  VideoSingleResponseSchema,
} from '@/modules/motivation/lib/validation'
import {
  canonicalYouTubeUrl,
  extractYouTubeId,
  fetchYouTubeMetadata,
  thumbnailFor,
} from '@/modules/motivation/lib/youtube'
import { registry } from '@/lib/openapi/registry'
import { DEFAULT_SECURITY, ErrorResponseSchema, InternalServerErrorResponse } from '@/lib/openapi/common'
import { motivationVideos, moduleSettings } from '@/lib/db/schema'
import { and, asc, desc, eq, sql } from 'drizzle-orm'

// Postgres unique_violation. Thrown when the (user_id, youtube_id) unique
// index is hit by the INSERT below.
const PG_UNIQUE_VIOLATION = '23505'

registry.registerPath({
  method: 'get',
  path: '/api/modules/motivation/videos',
  operationId: 'listMotivationVideos',
  summary: "List the user's motivation videos in their preferred sort order",
  tags: ['motivation'],
  security: DEFAULT_SECURITY,
  responses: {
    200: { description: 'Videos', content: { 'application/json': { schema: VideoListResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/modules/motivation/videos',
  operationId: 'addMotivationVideo',
  summary: 'Save a YouTube URL (fetches title/channel server-side via oEmbed)',
  tags: ['motivation'],
  security: DEFAULT_SECURITY,
  request: { body: { content: { 'application/json': { schema: addVideoSchema } } } },
  responses: {
    201: { description: 'Video saved', content: { 'application/json': { schema: VideoSingleResponseSchema } } },
    400: { description: 'Validation error', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    409: { description: 'Video already saved', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: InternalServerErrorResponse,
  },
})

export async function GET(_request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    // Settings probe and videos query share a single transaction so we
    // make one round-trip pair and the user_id filter is mandatory (the
    // default Postgres role bypasses RLS — see docs/SECURITY.md).
    const { videos } = await withRLS(async (db) => {
      const settingsRow = await db
        .select({ settings: moduleSettings.settings })
        .from(moduleSettings)
        .where(and(eq(moduleSettings.userId, user.id), eq(moduleSettings.moduleId, 'motivation')))
      const settings = (settingsRow[0]?.settings as { defaultSort?: string } | undefined) ?? {}
      const sort = settings.defaultSort === 'newest' || settings.defaultSort === 'oldest'
        ? settings.defaultSort
        : 'custom'

      const base = db.select().from(motivationVideos).where(eq(motivationVideos.userId, user.id))
      const videos = await (
        sort === 'newest'
          ? base.orderBy(desc(motivationVideos.createdAt))
          : sort === 'oldest'
            ? base.orderBy(asc(motivationVideos.createdAt))
            // custom: position ASC, then createdAt DESC as a tiebreaker
            : base.orderBy(asc(motivationVideos.position), desc(motivationVideos.createdAt))
      )
      return { videos }
    })

    return NextResponse.json({ videos: toSnakeCase(videos), count: videos.length })
  } catch (error) {
    console.error('GET /api/modules/motivation/videos error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const validation = await validateRequestBody(request, addVideoSchema)
    if (!validation.success) {
      return validation.response
    }

    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return createErrorResponse('Unauthorized - Valid authentication required', 401)
    }

    const youtubeId = extractYouTubeId(validation.data.url)
    if (!youtubeId) {
      return createErrorResponse('Could not find a YouTube video ID in that URL', 400)
    }

    // Fetch metadata BEFORE opening the DB transaction so the 5s outbound
    // request doesn't hold a pooled connection. Falls back to nulls if the
    // oEmbed call fails — the video still saves with just the ID.
    const meta = await fetchYouTubeMetadata(youtubeId)

    // Single-round-trip insert: position is computed as MAX+1 inside the
    // INSERT itself so two concurrent adds can't both land at the same
    // slot. Unique (user_id, youtube_id) covers the duplicate case — the
    // catch below converts that to a friendly 409.
    try {
      const inserted = await withRLS((db) =>
        db
          .insert(motivationVideos)
          .values({
            userId: user.id,
            youtubeId,
            url: canonicalYouTubeUrl(youtubeId),
            title: meta.title,
            channel: meta.channel,
            thumbnailUrl: thumbnailFor(youtubeId),
            position: sql<number>`(SELECT COALESCE(MAX(${motivationVideos.position}), 0) + 1 FROM ${motivationVideos} WHERE ${motivationVideos.userId} = ${user.id})`,
          })
          .returning(),
      )
      return NextResponse.json({ video: toSnakeCase(inserted[0]) }, { status: 201 })
    } catch (err) {
      if (isUniqueViolation(err)) {
        return createErrorResponse('This video is already in your list', 409)
      }
      throw err
    }
  } catch (error) {
    console.error('POST /api/modules/motivation/videos error:', error instanceof Error ? error.message : error)
    return createErrorResponse('Internal server error', 500)
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const code = (err as { code?: unknown }).code
  if (code === PG_UNIQUE_VIOLATION) return true
  // node-pg sometimes wraps the original; check `cause`.
  const cause = (err as { cause?: unknown }).cause
  if (typeof cause === 'object' && cause !== null) {
    return (cause as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  }
  return false
}
