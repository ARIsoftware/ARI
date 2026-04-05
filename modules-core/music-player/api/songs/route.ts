import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { musicPlaylist } from '@/lib/db/schema'
import { eq, asc, sql } from 'drizzle-orm'

const CreateSongSchema = z.object({
  youtube_video_id: z.string().min(1, 'YouTube video ID is required'),
  title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or less'),
})

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const songs = await withRLS((db) =>
      db.select().from(musicPlaylist).orderBy(asc(musicPlaylist.position))
    )

    return NextResponse.json({ songs: toSnakeCase(songs) || [] })
  } catch (error) {
    console.error('GET /api/modules/music-player/songs error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parseResult = CreateSongSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const { youtube_video_id, title } = parseResult.data

    // Get next position
    const maxPos = await withRLS((db) =>
      db.select({ max: sql<number>`COALESCE(MAX(position), -1)` })
        .from(musicPlaylist)
    )
    const nextPosition = (maxPos[0]?.max ?? -1) + 1

    const data = await withRLS((db) =>
      db.insert(musicPlaylist)
        .values({
          userId: user.id,
          youtubeVideoId: youtube_video_id,
          title,
          position: nextPosition,
        })
        .returning()
    )

    return NextResponse.json({ song: toSnakeCase(data[0]) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/music-player/songs error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing required parameter: id' }, { status: 400 })
    }

    await withRLS((db) =>
      db.delete(musicPlaylist).where(eq(musicPlaylist.id, id))
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/modules/music-player/songs error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing required parameter: id' }, { status: 400 })
    }

    const body = await request.json()
    const UpdateSchema = z.object({
      title: z.string().min(1, 'Title is required').max(500, 'Title must be 500 characters or less'),
    })
    const parseResult = UpdateSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const data = await withRLS((db) =>
      db.update(musicPlaylist)
        .set({ title: parseResult.data.title, updatedAt: sql`timezone('utc'::text, now())` })
        .where(eq(musicPlaylist.id, id))
        .returning()
    )

    return NextResponse.json({ song: toSnakeCase(data[0]) })
  } catch (error) {
    console.error('PUT /api/modules/music-player/songs error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
