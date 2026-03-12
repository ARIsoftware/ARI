import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { baseballTeams } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const UpdateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  city: z.string().min(1).max(100).optional(),
  league: z.string().min(1).max(10).optional(),
  division: z.string().min(1).max(20).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const parseResult = UpdateTeamSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: parseResult.error.issues }, { status: 400 })
    }

    const data = await withRLS((db) =>
      db.update(baseballTeams)
        .set(parseResult.data)
        .where(eq(baseballTeams.id, id))
        .returning()
    )

    if (data.length === 0) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    return NextResponse.json({ team: toSnakeCase(data[0]) })
  } catch (error) {
    console.error('PATCH /api/modules/baseball/teams/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
