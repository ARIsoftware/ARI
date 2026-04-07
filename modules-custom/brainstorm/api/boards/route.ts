import { NextRequest, NextResponse } from 'next/server'
import { desc, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { toSnakeCase } from '@/lib/api-helpers'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { brainstormBoards, brainstormNodes } from '@/lib/db/schema'

const CreateBoardSchema = z.object({
  name: z.string().min(1, 'Board name is required').max(200, 'Board name must be 200 characters or less'),
})

export async function GET(_request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized - Valid authentication required' }, { status: 401 })
    }

    const boards = await withRLS((db) =>
      db.select().from(brainstormBoards).orderBy(desc(brainstormBoards.updatedAt))
    )

    if (boards.length === 0) {
      return NextResponse.json({ boards: [] })
    }

    const boardIds = boards.map((b) => b.id)
    const nodes = await withRLS((db) =>
      db.select({ boardId: brainstormNodes.boardId })
        .from(brainstormNodes)
        .where(inArray(brainstormNodes.boardId, boardIds))
    )

    const counts = new Map<string, number>()
    for (const n of nodes) counts.set(n.boardId, (counts.get(n.boardId) || 0) + 1)

    const summaries = boards.map((b) => ({ ...b, nodeCount: counts.get(b.id) || 0 }))

    return NextResponse.json({ boards: toSnakeCase(summaries) })
  } catch (error) {
    console.error('GET /api/modules/brainstorm/boards error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, withRLS } = await getAuthenticatedUser()
    if (!user || !withRLS) {
      return NextResponse.json({ error: 'Unauthorized - Valid authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const parseResult = CreateBoardSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: parseResult.error.issues }, { status: 400 })
    }

    const [created] = await withRLS((db) =>
      db.insert(brainstormBoards)
        .values({ userId: user.id, name: parseResult.data.name.trim() })
        .returning()
    )

    return NextResponse.json({ board: toSnakeCase({ ...created, nodeCount: 0 }) }, { status: 201 })
  } catch (error) {
    console.error('POST /api/modules/brainstorm/boards error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
