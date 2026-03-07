import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { baseballPlayers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const UpdatePlayerSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  team_id: z.string().uuid().nullable().optional(),
  position: z.string().min(1).max(10).optional(),
  jersey_number: z.number().int().min(0).max(99).nullable().optional(),
  games: z.number().int().min(0).optional(),
  at_bats: z.number().int().min(0).optional(),
  hits: z.number().int().min(0).optional(),
  home_runs: z.number().int().min(0).optional(),
  rbi: z.number().int().min(0).optional(),
  batting_avg: z.number().min(0).max(1).optional(),
  obp: z.number().min(0).max(1).optional(),
  slg: z.number().min(0).max(4).optional(),
  ops: z.number().min(0).max(5).optional(),
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
    const parseResult = UpdatePlayerSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: parseResult.error.issues }, { status: 400 })
    }

    const d = parseResult.data

    const updateData: Record<string, any> = {}
    if (d.first_name !== undefined) updateData.firstName = d.first_name
    if (d.last_name !== undefined) updateData.lastName = d.last_name
    if (d.team_id !== undefined) updateData.teamId = d.team_id
    if (d.position !== undefined) updateData.position = d.position
    if (d.jersey_number !== undefined) updateData.jerseyNumber = d.jersey_number
    if (d.games !== undefined) updateData.games = d.games
    if (d.at_bats !== undefined) updateData.atBats = d.at_bats
    if (d.hits !== undefined) updateData.hits = d.hits
    if (d.home_runs !== undefined) updateData.homeRuns = d.home_runs
    if (d.rbi !== undefined) updateData.rbi = d.rbi
    if (d.batting_avg !== undefined) updateData.battingAvg = String(d.batting_avg)
    if (d.obp !== undefined) updateData.obp = String(d.obp)
    if (d.slg !== undefined) updateData.slg = String(d.slg)
    if (d.ops !== undefined) updateData.ops = String(d.ops)

    const data = await withRLS((db) =>
      db.update(baseballPlayers)
        .set(updateData)
        .where(eq(baseballPlayers.id, id))
        .returning()
    )

    if (data.length === 0) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    return NextResponse.json({ player: toSnakeCase(data[0]) })
  } catch (error) {
    console.error('PATCH /api/modules/baseball/players/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
