import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { baseballTeams } from '@/lib/db/schema'
import { eq, desc, and } from 'drizzle-orm'

const CreateTeamSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  city: z.string().min(1, 'City is required').max(100),
  league: z.string().min(1).max(10),
  division: z.string().min(1).max(20),
})

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const teams = await withRLS((db) =>
      db.select().from(baseballTeams).where(eq(baseballTeams.userId, user.id)).orderBy(desc(baseballTeams.createdAt))
    )

    return NextResponse.json({ teams: toSnakeCase(teams) || [] })
  } catch (error) {
    console.error('GET /api/modules/baseball/teams error:', error)
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
    const parseResult = CreateTeamSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: parseResult.error.issues }, { status: 400 })
    }

    const data = await withRLS((db) =>
      db.insert(baseballTeams)
        .values({ userId: user.id, ...parseResult.data })
        .returning()
    )

    return NextResponse.json({ team: toSnakeCase(data[0]) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/baseball/teams error:', error)
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
      db.delete(baseballTeams).where(and(eq(baseballTeams.id, id), eq(baseballTeams.userId, user.id)))
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/modules/baseball/teams error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
