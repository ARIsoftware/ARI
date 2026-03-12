import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { toSnakeCase } from '@/lib/api-helpers'
import { z } from 'zod'
import { baseballPlayers, baseballTeams } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

const CreatePlayerSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  team_id: z.string().uuid().nullable().optional(),
  position: z.string().min(1, 'Position is required').max(10),
  jersey_number: z.number().int().min(0, 'Jersey # must be 0-99').max(99, 'Jersey # must be 0-99').nullable().optional(),
  games: z.number().int().min(0, 'Games must be 0 or more').default(0),
  at_bats: z.number().int().min(0, 'At Bats must be 0 or more').default(0),
  hits: z.number().int().min(0, 'Hits must be 0 or more').default(0),
  home_runs: z.number().int().min(0, 'Home Runs must be 0 or more').default(0),
  rbi: z.number().int().min(0, 'RBI must be 0 or more').default(0),
  batting_avg: z.number().min(0, 'AVG must be between 0 and 1.000').max(1, 'AVG must be between 0 and 1.000').default(0),
  obp: z.number().min(0, 'OBP must be between 0 and 1.000').max(1, 'OBP must be between 0 and 1.000').default(0),
  slg: z.number().min(0, 'SLG must be between 0 and 4.000').max(4, 'SLG must be between 0 and 4.000').default(0),
  ops: z.number().min(0, 'OPS must be between 0 and 5.000').max(5, 'OPS must be between 0 and 5.000').default(0),
})

export async function GET(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const players = await withRLS((db) =>
      db.select({
        id: baseballPlayers.id,
        userId: baseballPlayers.userId,
        teamId: baseballPlayers.teamId,
        firstName: baseballPlayers.firstName,
        lastName: baseballPlayers.lastName,
        position: baseballPlayers.position,
        jerseyNumber: baseballPlayers.jerseyNumber,
        games: baseballPlayers.games,
        atBats: baseballPlayers.atBats,
        hits: baseballPlayers.hits,
        homeRuns: baseballPlayers.homeRuns,
        rbi: baseballPlayers.rbi,
        battingAvg: baseballPlayers.battingAvg,
        obp: baseballPlayers.obp,
        slg: baseballPlayers.slg,
        ops: baseballPlayers.ops,
        createdAt: baseballPlayers.createdAt,
        updatedAt: baseballPlayers.updatedAt,
        teamName: baseballTeams.name,
      })
        .from(baseballPlayers)
        .leftJoin(baseballTeams, eq(baseballPlayers.teamId, baseballTeams.id))
        .orderBy(desc(baseballPlayers.createdAt))
    )

    const normalized = players.map((p) => ({
      ...p,
      battingAvg: Number(p.battingAvg),
      obp: Number(p.obp),
      slg: Number(p.slg),
      ops: Number(p.ops),
    }))

    return NextResponse.json({ players: toSnakeCase(normalized) || [] })
  } catch (error) {
    console.error('GET /api/modules/baseball/players error:', error)
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
    const parseResult = CreatePlayerSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: parseResult.error.issues }, { status: 400 })
    }

    const d = parseResult.data

    const data = await withRLS((db) =>
      db.insert(baseballPlayers)
        .values({
          userId: user.id,
          firstName: d.first_name,
          lastName: d.last_name,
          teamId: d.team_id ?? null,
          position: d.position,
          jerseyNumber: d.jersey_number ?? null,
          games: d.games,
          atBats: d.at_bats,
          hits: d.hits,
          homeRuns: d.home_runs,
          rbi: d.rbi,
          battingAvg: String(d.batting_avg),
          obp: String(d.obp),
          slg: String(d.slg),
          ops: String(d.ops),
        })
        .returning()
    )

    return NextResponse.json({ player: toSnakeCase(data[0]) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/baseball/players error:', error)
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
      db.delete(baseballPlayers).where(eq(baseballPlayers.id, id))
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/modules/baseball/players error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
