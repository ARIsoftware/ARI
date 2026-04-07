import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { validateRequestBody, createErrorResponse } from '@/lib/api-helpers'
import { z } from 'zod'
import { musicPlaylist } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'

const ReorderSchema = z.object({
  orderedIds: z.array(z.string().uuid('Invalid song id format')).min(1).max(500),
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
