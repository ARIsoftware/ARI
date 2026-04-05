import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { z } from 'zod'
import { musicPlaylist } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

const ReorderSchema = z.object({
  orderedIds: z.array(z.string().min(1, 'Song ID is required')).min(1, 'At least one song ID is required'),
})

export async function PUT(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parseResult = ReorderSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const { orderedIds } = parseResult.data

    await withRLS(async (db) => {
      const updates = orderedIds.map((id, i) =>
        db.update(musicPlaylist)
          .set({ position: i, updatedAt: sql`timezone('utc'::text, now())` })
          .where(eq(musicPlaylist.id, id))
      )
      await Promise.all(updates)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PUT /api/modules/music-player/songs/reorder error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
