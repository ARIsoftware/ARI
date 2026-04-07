import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { brainstormBoards, brainstormNodes } from '@/lib/db/schema'
import { toSnakeCase } from '@/lib/api-helpers'

export async function GET() {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized - Valid authentication required' }, { status: 401 })
    }

    const [ideas, boards] = await Promise.all([
      withRLS((db) => db.select({ count: sql<number>`count(*)::int` }).from(brainstormNodes)),
      withRLS((db) => db.select({ count: sql<number>`count(*)::int` }).from(brainstormBoards)),
    ])

    return NextResponse.json(toSnakeCase({
      totalIdeasCreated: ideas[0]?.count || 0,
      totalBoards: boards[0]?.count || 0,
    }))
  } catch (error) {
    console.error('GET /api/modules/brainstorm/stats error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
